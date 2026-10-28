// Package terrain is the procedural world generator.
//
// It is a bit-exact port of the original JavaScript generator: integer hashing follows
// Math.imul / >>> semantics and floating point expressions keep the same evaluation
// order (explicit float64 conversions prevent fused multiply-adds), so worlds generated
// before the move to the server keep their terrain block for block.
package terrain

import "math"

// WorldSeed selects the world. It only lives on the server.
const WorldSeed = 20240611

// hash2 is a 2D integer hash in [0, 1).
func hash2(x, z, seed int) float64 {
	h := int32(x)*374761393 ^ int32(z)*668265263 ^ int32(seed+WorldSeed)*1274126177
	h = (h ^ int32(uint32(h)>>13)) * 1103515245
	h ^= int32(uint32(h) >> 16)
	return float64(uint32(h)) / 4294967296
}

func hash3(x, y, z, seed int) float64 {
	return hash2(x, int(int32(z)*31)+int(int32(y))*1013, seed)
}

func valueNoise(x, z float64, seed int) float64 {
	ixf := math.Floor(x)
	izf := math.Floor(z)
	fx := x - ixf
	fz := z - izf
	ux := float64(fx*fx*fx) * float64(float64(fx*float64(float64(fx*6)-15))+10)
	uz := float64(fz*fz*fz) * float64(float64(fz*float64(float64(fz*6)-15))+10)
	ix := int(ixf)
	iz := int(izf)
	a := hash2(ix, iz, seed)
	b := hash2(ix+1, iz, seed)
	c := hash2(ix, iz+1, seed)
	d := hash2(ix+1, iz+1, seed)
	return float64(float64(float64(a+float64((b-a)*ux))+float64((c-a)*uz)) + float64(float64((a-b-c+d)*ux)*uz))
}

// fbm is fractal noise in [0, 1]; scale is the size in blocks of the largest feature.
func fbm(x, z, scale float64, octaves, seed int) float64 {
	sum := 0.0
	amp := 0.5
	norm := 0.0
	freq := 1 / scale
	for o := range octaves {
		sum += float64(valueNoise(float64(x*freq), float64(z*freq), seed+o*101) * amp)
		norm += amp
		amp *= 0.5
		freq *= 2.03
	}
	return sum / norm
}

func smoothstep(edge0, edge1, x float64) float64 {
	t := math.Max(0, math.Min(1, (x-edge0)/(edge1-edge0)))
	return float64(t*t) * float64(3-float64(2*t))
}

func lerp(a, b, t float64) float64 {
	return a + float64((b-a)*t)
}

// jsRound matches JavaScript's Math.round (ties round towards +Infinity).
func jsRound(x float64) float64 {
	return math.Floor(x + 0.5)
}

// jsHypot matches V8's Math.hypot: values normalised by the maximum, Kahan-summed.
func jsHypot(values ...float64) float64 {
	max := 0.0
	for _, v := range values {
		if a := math.Abs(v); a > max {
			max = a
		}
	}
	if max == 0 {
		return 0
	}
	sum := 0.0
	compensation := 0.0
	for _, v := range values {
		n := math.Abs(v) / max
		summand := float64(n*n) - compensation
		preliminary := sum + summand
		compensation = (preliminary - sum) - summand
		sum = preliminary
	}
	return float64(math.Sqrt(sum) * max)
}
