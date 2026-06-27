package kernel

import (
	"crypto/rand"
	"encoding/hex"
	"strings"
	"time"
)

func NewID(prefix string) string {
	var bytes [8]byte
	if _, err := rand.Read(bytes[:]); err == nil {
		return prefix + "_" + hex.EncodeToString(bytes[:])
	}
	value := time.Now().UTC().Format("20060102150405.000000000")
	return prefix + "_" + strings.ReplaceAll(value, ".", "")
}

