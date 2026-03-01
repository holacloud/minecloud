.PHONY: build run clean dev

build:
	go build -o bin/server ./cmd/server

run: build
	./bin/server

dev:
	go run ./cmd/server

clean:
	rm -rf bin/

build-frontend:
	@echo "Frontend is served statically, no build needed"

install:
	go mod download
