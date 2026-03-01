package game

import "minecloud/pkg/world"

type Game struct {
	Players map[string]*Player
	World   *world.World
}

type Player struct {
	ID      string
	X, Y, Z float64
	Yaw     float64
	Pitch   float64
}

func NewGame() *Game {
	return &Game{
		Players: make(map[string]*Player),
		World:   world.New(),
	}
}
