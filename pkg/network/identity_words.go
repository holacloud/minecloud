package network

// recoveryWords are the words of a recovery code (identity.go): 256 short Spanish words, so each one
// is 8 bits of the code. Plain letters only (no Ñ, no accents), 3 to 6 of them, easy to read aloud and
// to copy by hand. TestRecoveryWords checks the count, the letters and that none repeats. Changing
// this list invalidates every code already shown to a player: append nothing, remove nothing.
var recoveryWords = [...]string{
	"PATO", "GATO", "PERRO", "LOBO", "OSO", "LEON", "TIGRE", "PUMA", "ZORRO", "CIERVO", "CABRA", "OVEJA",
	"VACA", "TORO", "BURRO", "CERDO", "CONEJO", "RATON", "ERIZO", "TOPO", "MONO", "CEBRA", "JIRAFA", "LLAMA",
	"ALCE", "CASTOR", "NUTRIA", "FOCA", "ORCA", "DELFIN", "PULPO", "GAMBA", "ATUN", "TRUCHA", "SALMON", "RANA",
	"SAPO", "IGUANA", "COBRA", "BOA", "AGUILA", "BUHO", "LORO", "PALOMA", "GARZA", "CISNE", "GANSO", "GALLO",
	"POLLO", "PAVO", "CUERVO", "MIRLO", "TUCAN", "KOALA", "PANDA", "YAK", "HIENA", "LINCE", "ABEJA", "GRILLO",
	"MEDUSA",
	"ROJO", "AZUL", "VERDE", "NEGRO", "BLANCO", "GRIS", "ROSA", "MORADO", "DORADO", "OCRE", "LILA", "ALTO",
	"BAJO", "LISTO", "FELIZ", "RAPIDO", "LENTO", "FUERTE", "SUAVE", "DULCE", "SALADO", "FRIO", "CALIDO", "TIBIO",
	"NUEVO", "GRANDE", "CHICO", "LIGERO", "PESADO", "LIMPIO", "BRAVO", "SABIO", "CALMO", "ALEGRE", "AMABLE",
	"NOBLE", "SERENO", "VELOZ", "AGIL", "FIRME", "CLARO",
	"LUNA", "SOL", "NUBE", "LLUVIA", "NIEVE", "HIELO", "FUEGO", "AGUA", "TIERRA", "AIRE", "VIENTO", "RAYO",
	"TRUENO", "MONTE", "VALLE", "RIO", "LAGO", "MAR", "PLAYA", "ARENA", "ROCA", "PIEDRA", "BOSQUE", "SELVA",
	"PRADO", "CAMPO", "ISLA", "COSTA", "CUEVA", "VOLCAN", "COMETA", "CIELO", "AURORA", "BRISA", "OLA", "NIEBLA",
	"ROCIO", "FLOR", "LIRIO", "CACTUS", "PINO", "ROBLE", "OLMO", "SAUCE", "HAYA", "ALAMO", "MUSGO", "HOJA",
	"RAMA", "RAIZ", "TRIGO", "MAIZ", "ARROZ",
	"PAN", "QUESO", "LECHE", "MIEL", "PERA", "UVA", "KIWI", "MANGO", "LIMON", "FRESA", "CEREZA", "MELON",
	"SANDIA", "COCO", "NUEZ", "TOMATE", "PATATA", "AJO", "HABA", "SOPA", "TARTA", "CHURRO", "FLAN", "CACAO",
	"AZUCAR",
	"BARCO", "TREN", "AVION", "COCHE", "MOTO", "BICI", "COHETE", "GLOBO", "CASA", "TORRE", "PUENTE", "PUERTA",
	"LLAVE", "RELOJ", "LIBRO", "LAPIZ", "PLUMA", "TAZA", "PLATO", "VASO", "SILLA", "MESA", "CAMA", "VELA",
	"FARO", "MAPA", "ESPADA", "ESCUDO", "CASCO", "CORONA", "ANILLO", "PERLA", "RUBI", "JADE", "ORO", "PLATA",
	"COBRE", "HIERRO", "BRONCE", "TAMBOR", "FLAUTA", "PIANO", "VIOLIN", "ARPA", "BALON", "PELOTA", "DADO",
	"CARTA", "CAJA", "CESTA", "BOTA", "GORRO", "GUANTE", "CAPA", "HACHA", "PALA", "CUERDA", "NUDO", "RUEDA",
	"MOTOR", "ROBOT", "IMAN", "LUPA", "ANCLA", "REMO", "VELERO", "BALSA", "CANOA", "MOLINO", "GRANJA", "HUERTO",
	"JARDIN", "PATIO", "PLAZA", "PARQUE", "ZAFIRO",
}
