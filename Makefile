.PHONY: build run clean dev test test-go test-js

build:
	go build -o bin/server ./cmd/server

run: build
	go run ./cmd/server

dev:
	go run ./cmd/server

# Everything: the Go tests, then every JS test (about 4 minutes).
test: test-go test-js

test-go:
	go test ./...

test-js:
	node --test 'test/js/*.test.js'

clean:
	rm -rf bin/

build-frontend:
	@echo "Frontend is served statically, no build needed"

install:
	go mod download
