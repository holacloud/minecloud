package network

import (
	"sort"
	"testing"
)

// What every registered message has to do with plots (registry.go), walked with a stranger: a new message
// is in one of these tests from the moment it is registered, with nothing to add here.

// A plotGuarded message never reaches its handler from a stranger in Ana's plot, whatever it is.
func TestEveryGuardedMessageIsRefusedToAStrangerInAPlot(t *testing.T) {
	claimWorld(t)
	claimAnaPlot(t)
	beto := claimClient(t, "Beto", plrBeto, 101, 121.6, 101)

	guarded := 0
	for kind, spec := range messages {
		if spec.plot != plotGuarded {
			continue
		}
		guarded++
		reached := false
		probe := messageSpec{plot: plotGuarded, handle: func(*Client, Message) { reached = true }}
		messages[kind] = probe
		claimHeard(beto)
		claimSend(t, beto, kind, map[string]int{"x": 103, "y": 120, "z": 103})
		refusal := claimRefusalOf(t, claimHeard(beto))
		claimSend(t, beto, kind, map[string]int{"x": 300, "y": 120, "z": 300})
		messages[kind] = spec

		if refusal == nil || refusal.Reason != claimReasonPlot || refusal.Owner != "Ana" {
			t.Errorf("%s: a stranger in the plot is not refused: %+v", kind, refusal)
		}
		if !reached {
			t.Errorf("%s: outside every plot it never reached its handler", kind)
		}
	}
	if guarded == 0 {
		t.Fatal("no guarded message is registered")
	}

	// And the handler is what the refusal stopped.
	reached := false
	messages["registryTestProbe"] = messageSpec{plot: plotGuarded, handle: func(*Client, Message) { reached = true }}
	defer delete(messages, "registryTestProbe")
	claimSend(t, beto, "registryTestProbe", map[string]int{"x": 103, "y": 120, "z": 103})
	if reached {
		t.Error("a guarded message reached its handler from a stranger in the plot")
	}
}

// A plotChecked message checks by itself, so nothing but a test says that it does: each one is among the
// paths the plots' tests walk with a stranger (claimPaths), or tested where this says.
func TestEveryCheckedMessageIsWalkedByAStranger(t *testing.T) {
	testedElsewhere := map[string]string{
		// Only a creative session gets as far as the check, and that is the admin, who passes it.
		"constructionStock": "construction_stock_test.go",
	}
	walked := map[string]bool{}
	for _, path := range claimPaths() {
		walked[path.kind] = true
		if spec, ok := messages[path.kind]; !ok || (spec.plot != plotGuarded && spec.plot != plotChecked) {
			t.Errorf("%s is walked as protected but is not registered as guarded or checked", path.kind)
		}
	}
	var missing []string
	for kind, spec := range messages {
		if spec.plot == plotChecked && !walked[kind] && testedElsewhere[kind] == "" {
			missing = append(missing, kind)
		}
	}
	sort.Strings(missing)
	for _, kind := range missing {
		t.Errorf("%s says it checks the plots by itself: add it to claimPaths (claims_test.go) so a stranger tries it", kind)
	}
}

func TestAMessageMustSayWhatItHasToDoWithPlots(t *testing.T) {
	handle := func(*Client, Message) {}
	for name, spec := range map[string]messageSpec{
		"says nothing":            {handle: handle},
		"open without a why":      {plot: plotOpen, handle: handle},
		"a why that is not open":  {plot: plotGuarded, why: "because", handle: handle},
		"no handler":              {plot: plotNowhere},
		"a type registered twice": {plot: plotNowhere, handle: handle},
	} {
		kind := "registryTestBad"
		if name == "a type registered twice" {
			kind = "chat"
		}
		func() {
			defer func() {
				delete(messages, "registryTestBad")
				if recover() == nil {
					t.Errorf("%s: registered without a complaint", name)
				}
			}()
			registerMessage(spec, kind)
		}()
	}
}
