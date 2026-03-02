package main

import (
	"fmt"
	"net/http"

	"github.com/gorilla/websocket"
)

func main() {
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		fmt.Println("WebSocket request received")
		upgrader := websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			fmt.Println("Upgrade error:", err)
			return
		}
		fmt.Println("Client connected!")
		defer conn.Close()

		for {
			mt, message, err := conn.ReadMessage()
			if err != nil {
				fmt.Println("Read error:", err)
				break
			}
			fmt.Printf("Received: %s\n", message)
			err = conn.WriteMessage(mt, message)
			if err != nil {
				fmt.Println("Write error:", err)
				break
			}
		}
	})

	fmt.Println("Starting test server on :8081")
	err := http.ListenAndServe(":8081", nil)
	if err != nil {
		fmt.Println("Error:", err)
	}
}
