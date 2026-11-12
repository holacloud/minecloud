// A load test of the game server: players that are not there. Each one connects, joins, says where it
// is ten times a second as a real client does (js/game.js), and asks for the chunks around it as it
// walks. The players come in steps; for each step it reports what the server spent, what each player was
// sent, and how long a move took to reach the players that were told of it.
//
//	bin/server -addr :8091                      # a server of its own, in a copy of data/: never the real one
//	go run ./cmd/loadtest -url ws://localhost:8091/ws -pid $(pgrep -x server) -steps 10,50,100,200
//
// Every player is a session, a registration and a player record on the server's disk: run it against a
// throwaway copy of the data.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"math/rand"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"

	"minecloud/pkg/terrain"
)

var (
	url      = flag.String("url", "ws://localhost:8091/ws", "the server's WebSocket")
	steps    = flag.String("steps", "10,25,50,100,150,200", "how many players at each step")
	settle   = flag.Duration("settle", 6*time.Second, "what a step waits before it measures (joins, first chunks)")
	hold     = flag.Duration("hold", 15*time.Second, "how long a step is measured")
	pid      = flag.Int("pid", 0, "the server's process, to read its CPU and memory (Linux)")
	explore  = flag.Float64("explore", 0, "the part of the players that walk straight away from the centre, into terrain nobody has seen")
	radius   = flag.Int("radius", 4, "chunks a player asks for around itself (the client's default render distance)")
	spread   = flag.Float64("spread", 48, "blocks around the centre where the players start and wander")
	moveRate = flag.Duration("move", 100*time.Millisecond, "time between a player's moves")
	still    = flag.Float64("still", 0, "the part of the players that stand still")
	label    = flag.String("label", "", "a name for this run, printed with the table")
)

type counters struct {
	messages, bytes, chunks, chunkBytes, sent atomic.Int64
	entries                                   atomic.Int64 // players told about, in all the messages
	gone                                      atomic.Int64 // players the server dropped or lost
	mu                                        sync.Mutex
	echoes                                    []time.Duration
}

var stats counters

func (c *counters) echo(d time.Duration) {
	c.mu.Lock()
	c.echoes = append(c.echoes, d)
	c.mu.Unlock()
}

type bot struct {
	id       string
	conn     *websocket.Conn
	writeMu  sync.Mutex
	x, z     float64
	heading  float64
	explorer bool
	still    bool
	seq      int
	sentMu   sync.Mutex
	sentAt   [64]sentMove // the last moves, by seq % 64
	asked    map[[2]int]bool
	chunk    [2]int
}

type sentMove struct {
	seq int
	at  time.Time
}

// Every player of this run, by id: who is told of a move finds here when it was made.
var bots sync.Map

func (b *bot) send(kind string, payload any) error {
	data, err := json.Marshal(map[string]any{"type": kind, "payload": payload})
	if err != nil {
		return err
	}
	b.writeMu.Lock()
	defer b.writeMu.Unlock()
	return b.conn.WriteMessage(websocket.TextMessage, data)
}

// What a client asks as it comes into a chunk: those around it that it has not asked for yet.
func (b *bot) askChunks() {
	cx := int(math.Floor(b.x / terrain.ChunkSize))
	cz := int(math.Floor(b.z / terrain.ChunkSize))
	if b.asked != nil && b.chunk == [2]int{cx, cz} {
		return
	}
	if b.asked == nil {
		b.asked = map[[2]int]bool{}
	}
	b.chunk = [2]int{cx, cz}
	var wanted [][2]int
	for dx := -*radius; dx <= *radius; dx++ {
		for dz := -*radius; dz <= *radius; dz++ {
			c := [2]int{cx + dx, cz + dz}
			if !b.asked[c] {
				b.asked[c] = true
				wanted = append(wanted, c)
			}
		}
	}
	// A client forgets what is far behind, and would ask for it again on coming back.
	for c := range b.asked {
		if abs(c[0]-cx) > *radius+2 || abs(c[1]-cz) > *radius+2 {
			delete(b.asked, c)
		}
	}
	b.send("chunkFocus", map[string]int{"chunkX": cx, "chunkZ": cz, "radius": *radius})
	if len(wanted) > 0 {
		b.send("chunkRequest", map[string]any{"chunks": wanted})
	}
}

func abs(v int) int {
	if v < 0 {
		return -v
	}
	return v
}

func (b *bot) run() {
	defer stats.gone.Add(1)
	defer b.conn.Close()
	go b.read()
	if b.send("playerJoin", map[string]string{"playerId": b.id, "username": "bot" + b.id[len(b.id)-5:], "shirtColor": "#3366cc"}) != nil {
		return
	}
	const speed = 4.3 // blocks a second, a walking player
	step := speed * moveRate.Seconds()
	ticker := time.NewTicker(*moveRate)
	defer ticker.Stop()
	// Not all on the same instant.
	time.Sleep(time.Duration(rand.Int63n(int64(*moveRate))))
	said := time.Time{}
	for range ticker.C {
		if b.still {
			// As the client: a player that has not changed says where it is every two seconds.
			if time.Since(said) < 2*time.Second {
				continue
			}
			said = time.Now()
		} else if !b.explorer {
			b.heading += (rand.Float64() - 0.5) * 0.4
			if math.Hypot(b.x, b.z) > *spread {
				b.heading = math.Atan2(-b.z, -b.x)
			}
		}
		if !b.still {
			b.x += math.Cos(b.heading) * step
			b.z += math.Sin(b.heading) * step
			b.seq++
		}
		b.askChunks()
		b.sentMu.Lock()
		b.sentAt[b.seq%len(b.sentAt)] = sentMove{seq: b.seq, at: time.Now()}
		b.sentMu.Unlock()
		// The yaw carries the number of the move, to know it when it comes back.
		err := b.send("playerMove", map[string]any{
			"id": b.id, "username": "bot" + b.id[len(b.id)-5:], "x": b.x, "y": 70.0, "z": b.z,
			"yaw": float64(b.seq), "pitch": 0.0, "shirtColor": "#3366cc", "hairStyle": "short", "hairColor": "#553311",
			"heldItem": "wooden_pickaxe", "offhandItem": "", "action": "", "mount": "", "mountYaw": 0,
		})
		if err != nil {
			return
		}
		stats.sent.Add(1)
	}
}

func (b *bot) read() {
	moves := []byte(`"type":"playerMoves"`)
	for {
		kind, data, err := b.conn.ReadMessage()
		if err != nil {
			b.conn.Close()
			return
		}
		if kind == websocket.BinaryMessage {
			stats.chunks.Add(1)
			stats.chunkBytes.Add(int64(len(data)))
			continue
		}
		stats.messages.Add(1)
		stats.bytes.Add(int64(len(data)))
		if !bytes.Contains(data, moves) {
			continue
		}
		var message struct {
			Payload struct {
				Players []struct {
					ID  string  `json:"id"`
					Yaw float64 `json:"yaw"`
				} `json:"players"`
			} `json:"payload"`
		}
		if json.Unmarshal(data, &message) != nil {
			continue
		}
		now := time.Now()
		stats.entries.Add(int64(len(message.Payload.Players)))
		for _, told := range message.Payload.Players {
			other, ok := bots.Load(told.ID)
			if !ok {
				continue
			}
			from := other.(*bot)
			if from.still {
				continue
			}
			seq := int(told.Yaw)
			from.sentMu.Lock()
			move := from.sentAt[seq%len(from.sentAt)]
			from.sentMu.Unlock()
			if move.seq == seq {
				stats.echo(now.Sub(move.at))
			}
		}
	}
}

func newBot(n int) (*bot, error) {
	conn, _, err := websocket.DefaultDialer.Dial(*url, nil)
	if err != nil {
		return nil, err
	}
	angle := rand.Float64() * 2 * math.Pi
	distance := rand.Float64() * *spread
	b := &bot{
		id:      fmt.Sprintf("loadtest_%d_%05d", os.Getpid(), n),
		conn:    conn,
		x:       math.Cos(angle) * distance,
		z:       math.Sin(angle) * distance,
		heading: rand.Float64() * 2 * math.Pi,
	}
	if rand.Float64() < *explore {
		b.explorer = true
		b.heading = angle
	} else if rand.Float64() < *still {
		b.still = true
	}
	bots.Store(b.id, b)
	return b, nil
}

// The server's CPU time so far, and the memory it holds now.
func serverUsage() (cpu time.Duration, rss int64) {
	if *pid == 0 {
		return 0, 0
	}
	stat, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", *pid))
	if err != nil {
		return 0, 0
	}
	// After the name in brackets, which may hold spaces: state is field 3, utime 14, stime 15.
	fields := strings.Fields(string(stat[bytes.LastIndexByte(stat, ')')+2:]))
	if len(fields) < 13 {
		return 0, 0
	}
	utime, _ := strconv.ParseInt(fields[11], 10, 64)
	stime, _ := strconv.ParseInt(fields[12], 10, 64)
	cpu = time.Duration(utime+stime) * (time.Second / 100)
	statm, _ := os.ReadFile(fmt.Sprintf("/proc/%d/statm", *pid))
	if parts := strings.Fields(string(statm)); len(parts) > 1 {
		pages, _ := strconv.ParseInt(parts[1], 10, 64)
		rss = pages * int64(os.Getpagesize())
	}
	return cpu, rss
}

func percentile(sorted []time.Duration, p float64) time.Duration {
	if len(sorted) == 0 {
		return 0
	}
	return sorted[int(float64(len(sorted)-1)*p)]
}

func main() {
	flag.Parse()
	var targets []int
	for _, part := range strings.Split(*steps, ",") {
		n, err := strconv.Atoi(strings.TrimSpace(part))
		if err != nil || n <= 0 {
			fmt.Fprintln(os.Stderr, "steps: a list of numbers, as 10,50,100")
			os.Exit(2)
		}
		targets = append(targets, n)
	}

	fmt.Printf("# %s explore=%.2f still=%.2f spread=%.0f radius=%d move=%s hold=%s\n", *label, *explore, *still, *spread, *radius, *moveRate, *hold)
	fmt.Println("players  alive  cpu%   rss_mb  msgs/player/s  told/player/s  mbit_out/s  kbit/player  chunks/s  delay_p50  delay_p99  delay_max")
	started := 0
	for _, target := range targets {
		for started < target {
			b, err := newBot(started)
			if err != nil {
				fmt.Fprintf(os.Stderr, "player %d could not connect: %v\n", started, err)
				stats.gone.Add(1)
			} else {
				go b.run()
			}
			started++
			time.Sleep(4 * time.Millisecond)
		}
		time.Sleep(*settle)

		stats.mu.Lock()
		stats.echoes = stats.echoes[:0]
		stats.mu.Unlock()
		messages, textBytes, chunks, chunkBytes, entries := stats.messages.Load(), stats.bytes.Load(), stats.chunks.Load(), stats.chunkBytes.Load(), stats.entries.Load()
		cpu, _ := serverUsage()
		begin := time.Now()
		time.Sleep(*hold)
		seconds := time.Since(begin).Seconds()
		cpuAfter, rss := serverUsage()

		stats.mu.Lock()
		echoes := append([]time.Duration(nil), stats.echoes...)
		stats.mu.Unlock()
		sort.Slice(echoes, func(i, j int) bool { return echoes[i] < echoes[j] })
		alive := started - int(stats.gone.Load())
		out := float64(stats.bytes.Load()-textBytes+stats.chunkBytes.Load()-chunkBytes) * 8 / seconds
		players := math.Max(1, float64(alive))
		fmt.Printf("%7d  %5d  %5.0f  %6.0f  %13.1f  %13.1f  %10.1f  %11.0f  %8.0f  %9s  %9s  %9s\n",
			target, alive,
			100*(cpuAfter-cpu).Seconds()/seconds, float64(rss)/1e6,
			float64(stats.messages.Load()-messages)/seconds/players, float64(stats.entries.Load()-entries)/seconds/players,
			out/1e6, out/players/1e3,
			float64(stats.chunks.Load()-chunks)/seconds,
			percentile(echoes, 0.5).Round(time.Millisecond), percentile(echoes, 0.99).Round(time.Millisecond),
			percentile(echoes, 1).Round(time.Millisecond))
	}
}
