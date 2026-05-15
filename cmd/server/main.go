package main

import (
	"log"
	"net/http"

	"github.com/fulldump/goconfig"

	"minecloud/pkg/network"
	"minecloud/pkg/web"
)

type Config struct {
	Addr           string `usage:"Port to listen on"`
	STUNURLs       string `usage:"Comma-separated STUN URLs for WebRTC voice"`
	TURNURLs       string `usage:"Comma-separated TURN URLs for WebRTC voice"`
	TURNUsername   string `usage:"TURN username for WebRTC voice"`
	TURNCredential string `usage:"TURN credential for WebRTC voice"`
	MeteredAPIBase string `usage:"Metered TURN API base URL"`
	MeteredAPIKey  string `usage:"Metered TURN API key"`
}

func main() {

	config := &Config{
		Addr:           ":8080",
		STUNURLs:       "stun:stun.relay.metered.ca:80",
		TURNURLs:       "turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:80?transport=tcp,turn:global.relay.metered.ca:443,turns:global.relay.metered.ca:443?transport=tcp",
		MeteredAPIBase: "https://minecloud.metered.live",
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

	if err := network.Initialize(); err != nil {
		log.Fatal(err)
	}

	http.HandleFunc("/voice-test", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/voice-test.html", http.StatusFound)
	})
	http.Handle("/", http.FileServer(http.FS(web.MustStaticFS())))
	http.HandleFunc("/ice-servers", network.HandleICEServers)
	http.HandleFunc("/ws", network.HandleWebSocket)

	log.Println("Server started on", config.Addr)
	log.Println("WebSocket endpoint: " + config.Addr + "/ws")

	if err := http.ListenAndServe(config.Addr, nil); err != nil {
		log.Fatal(err)
	}
}
