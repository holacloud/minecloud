package main

import (
	"log"
	"net/http"

	"minecloud/pkg/network"
	"minecloud/pkg/web"
)

func main() {
	if err := network.Initialize(); err != nil {
		log.Fatal(err)
	}

	http.Handle("/", http.FileServer(http.FS(web.MustStaticFS())))
	http.HandleFunc("/ws", network.HandleWebSocket)

	log.Println("Server started on http://localhost:8080")
	log.Println("WebSocket endpoint: ws://localhost:8080/ws")

	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal(err)
	}
}
