package network

import (
	"encoding/json"
	"fmt"
	"hash/fnv"
	"log"
	"net/http"

	"minecloud/pkg/terrain"
)

// handleViewerClaims tells the viewer where the plots are (claims.go), for its "Show plots" option. Like
// the rest of /viewer-api/ it needs no login: each plot's square, the height of its marker and its owner's
// name (the name they play with, which the viewer's players option shows anyway), and the spawn zone with
// the terrain's height at the spawn point. Never a player id (TestViewerClaimsPayloadHasNoPlayerIDs).
//
//	GET claims  {"spawn":{"minX":-16,...,"y":12},"claims":[{"owner":"Ana","minX":92,...,"y":64}, ...]}
//
// Plots change seldom and a list of them is small: it is built on each request, with an ETag.

type viewerClaim struct {
	Owner string `json:"owner"`
	claimRect
	Y int `json:"y"`
}

type viewerSpawn struct {
	claimRect
	Y int `json:"y"`
}

type viewerClaims struct {
	Spawn  *viewerSpawn  `json:"spawn"`
	Claims []viewerClaim `json:"claims"`
}

func viewerClaimsBody() ([]byte, error) {
	answer := viewerClaims{Claims: []viewerClaim{}}
	if spawnZoneOn {
		answer.Spawn = &viewerSpawn{claimRect: spawnZone, Y: terrain.ColumnSurface(0, 0).Height}
	}
	for _, c := range claims.list() {
		answer.Claims = append(answer.Claims, viewerClaim{Owner: c.OwnerName, claimRect: c.rect(), Y: c.Y})
	}
	return json.Marshal(answer)
}

func handleViewerClaims(w http.ResponseWriter, r *http.Request) {
	body, err := viewerClaimsBody()
	if err != nil {
		log.Printf("viewer claims: %v", err)
		http.Error(w, "claims unavailable", http.StatusInternalServerError)
		return
	}
	hash := fnv.New64a()
	hash.Write(body)
	writeViewerBody(w, r, fmt.Sprintf(`"%x"`, hash.Sum64()), "application/json", true, func() []byte { return body })
}
