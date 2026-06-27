package main

import (
	"log"
	"os"
	"path/filepath"
	"time"

	ingestionapp "paper-reading/internal/ingestion/application"
	"paper-reading/internal/ingestion/infrastructure/mineru"
	readerapp "paper-reading/internal/reader/application"
	"paper-reading/internal/shared/persistence"
	"paper-reading/internal/shared/storage"
)

func main() {
	root, err := os.Getwd()
	if err != nil {
		log.Fatal(err)
	}

	dataDir := env("PAPER_DATA_DIR", filepath.Join(root, "data"))
	store, err := persistence.NewJSONStore(filepath.Join(dataDir, "go-store.json"))
	if err != nil {
		log.Fatal(err)
	}

	service := ingestionapp.NewService(
		store,
		storage.NewLocalStore(filepath.Join(dataDir, "objects")),
		readerapp.NewMarkdownNormalizer(),
		mineru.NewClient(mineru.Config{
			BaseURL: "https://mineru.net",
			Token:   os.Getenv("MINERU_API_TOKEN"),
			Timeout: 90 * time.Second,
		}),
	)

	if env("WORKER_LOOP", "false") == "true" {
		for {
			runSync(service)
			time.Sleep(30 * time.Second)
		}
	}
	runSync(service)
}

func runSync(service *ingestionapp.Service) {
	result, err := service.SyncSubmittedJobs()
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("MinerU sync checked=%d updated=%d", result.Checked, len(result.Updated))
}

func env(key string, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
