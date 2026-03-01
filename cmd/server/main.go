package main

import (
	"log"
	"net/http"

	"minecloud/pkg/network"
)

func main() {
	http.Handle("/", http.FileServer(http.Dir("static")))
	http.HandleFunc("/ws", network.HandleWebSocket)

	log.Println("Server started on http://localhost:8080")
	log.Println("WebSocket endpoint: ws://localhost:8080/ws")

	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal(err)
	}
}
