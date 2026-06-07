package main

import (
	"context"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/fulldump/goconfig"

	"minecloud/pkg/network"
	"minecloud/pkg/web"
	"minecloud/pkg/world"
)

type Config struct {
	Addr              string `usage:"Port to listen on"`
	Statics           string `usage:"Directory to serve static files from disk; empty uses embedded static files"`
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
	http.HandleFunc("/api/terrain/inspect", world.HandleTerrainInspect)
	http.HandleFunc("/api/terrain/tile", world.HandleTerrainTile)
	http.HandleFunc("/api/terrain/cube", world.HandleTerrainCube)
	http.HandleFunc("/api/terrain/spawn", world.HandleTerrainSpawn)
	http.HandleFunc("/api/world/deltas", network.HandleWorldDeltas)
	var staticFS fs.FS
	if config.Statics != "" {
		info, err := os.Stat(config.Statics)
		if err != nil {
			log.Fatalf("Statics directory %q is not available: %v", config.Statics, err)
		}
		if !info.IsDir() {
			log.Fatalf("Statics path %q is not a directory", config.Statics)
		}
		log.Println("Serving static files from", config.Statics)
		staticFS = os.DirFS(config.Statics)
	} else {
		log.Println("Serving embedded static files")
		staticFS = web.MustStaticFS()
	}
	http.Handle("/", network.SessionMiddleware(http.FileServer(http.FS(staticFS))))
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
