package main

import (
	"log"
	"net/http"

	"github.com/fulldump/goconfig"

	"minecloud/pkg/network"
	"minecloud/pkg/web"
)

type Config struct {
	Addr string `usage:"Port to listen on"`
}

func main() {

	config := &Config{
		Addr: ":8080",
	}
	goconfig.Read(config)

	if err := network.Initialize(); err != nil {
		log.Fatal(err)
	}

	http.Handle("/", http.FileServer(http.FS(web.MustStaticFS())))
	http.HandleFunc("/ws", network.HandleWebSocket)

	log.Println("Server started on", config.Addr)
	log.Println("WebSocket endpoint: " + config.Addr + "/ws")

	if err := http.ListenAndServe(config.Addr, nil); err != nil {
		log.Fatal(err)
	}
}
