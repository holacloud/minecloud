package main

import (
	"context"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/fulldump/goconfig"

	"minecloud/pkg/network"
	"minecloud/pkg/web"
)

type Config struct {
	Addr              string `usage:"Port to listen on"`
	STUNURLs          string `usage:"Comma-separated STUN URLs for WebRTC voice"`
	TURNURLs          string `usage:"Comma-separated TURN URLs for WebRTC voice"`
	TURNUsername      string `usage:"TURN username for WebRTC voice"`
	TURNCredential    string `usage:"TURN credential for WebRTC voice"`
	MeteredAPIBase    string `usage:"Metered TURN API base URL"`
	MeteredAPIKey     string `usage:"Metered TURN API key"`
	SessionGlobalSalt string `usage:"Global secret salt for hashing session cookies"`
}

func main() {

	config := &Config{
		Addr:              ":8080",
		STUNURLs:          "stun:stun.relay.metered.ca:80",
		TURNURLs:          "turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:80?transport=tcp,turn:global.relay.metered.ca:443,turns:global.relay.metered.ca:443?transport=tcp",
		MeteredAPIBase:    "https://minecloud.metered.live",
		SessionGlobalSalt: "just-for-development",
	}
	goconfig.Read(config)
	network.ConfigureICE(network.ICEConfig{
		STUNURLs:       config.STUNURLs,
		TURNURLs:       config.TURNURLs,
		TURNUsername:   config.TURNUsername,
		TURNCredential: config.TURNCredential,
		MeteredAPIBase: config.MeteredAPIBase,
		MeteredAPIKey:  config.MeteredAPIKey,
	})
	network.ConfigureAudit(network.AuditConfig{
		SessionGlobalSalt: config.SessionGlobalSalt,
	})

	if err := network.Initialize(); err != nil {
		log.Fatal(err)
	}

	http.HandleFunc("/voice-test", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/voice-test.html", http.StatusFound)
	})
	http.Handle("/", network.SessionMiddleware(http.FileServer(http.FS(web.MustStaticFS()))))
	http.HandleFunc("/ice-servers", network.HandleICEServers)
	http.HandleFunc("/ws", network.HandleWebSocket)

	server := &http.Server{Addr: config.Addr}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		<-ctx.Done()
		log.Println("Shutting down server gracefully")
		if err := network.SavePlayerStates(); err != nil {
			log.Printf("Failed to save player states: %v", err)
		}

		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("Server shutdown error: %v", err)
		}
	}()

	log.Println("Server started on", config.Addr)
	log.Println("WebSocket endpoint: " + config.Addr + "/ws")

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
