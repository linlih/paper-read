package main

import (
	"encoding/json"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"time"

	annotationapp "paper-reading/internal/annotation/application"
	annotationhttp "paper-reading/internal/annotation/transport/http"
	catalogapp "paper-reading/internal/catalog/application"
	cataloghttp "paper-reading/internal/catalog/transport/http"
	chatapp "paper-reading/internal/chat/application"
	chathttp "paper-reading/internal/chat/transport/http"
	importerapp "paper-reading/internal/importer/application"
	ingestionapp "paper-reading/internal/ingestion/application"
	"paper-reading/internal/ingestion/infrastructure/mineru"
	ingestionhttp "paper-reading/internal/ingestion/transport/http"
	readerapp "paper-reading/internal/reader/application"
	readerhttp "paper-reading/internal/reader/transport/http"
	settingsapp "paper-reading/internal/settings/application"
	settingshttp "paper-reading/internal/settings/transport/http"
	"paper-reading/internal/shared/persistence"
	"paper-reading/internal/shared/storage"
	transport "paper-reading/internal/shared/transport"
	userapp "paper-reading/internal/user/application"
	userdomain "paper-reading/internal/user/domain"
	userhttp "paper-reading/internal/user/transport/http"
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

	objectStore := storage.NewLocalStore(filepath.Join(dataDir, "objects"))
	normalizer := readerapp.NewMarkdownNormalizer()
	mineruClient := mineru.NewClient(mineru.Config{
		BaseURL: "https://mineru.net",
		Token:   os.Getenv("MINERU_API_TOKEN"),
		Timeout: 90 * time.Second,
	})

	catalogService := catalogapp.NewService(store)
	readerService := readerapp.NewService(store)
	annotationService := annotationapp.NewService(store)
	chatService := chatapp.NewService(store)
	ingestionService := ingestionapp.NewService(store, objectStore, normalizer, mineruClient)
	importerService := importerapp.NewService(store, objectStore, env("ARXIV_HTML_BASE_URL", "https://arxiv.org"))
	userService := userapp.NewService(store)
	settingsService := settingsapp.NewService(store)

	mux := http.NewServeMux()
	registerAPI(mux, catalogService, readerService, annotationService, chatService, ingestionService, importerService, userService, settingsService, store, objectStore, filepath.Join(dataDir, "frontend-store.json"))
	registerStatic(mux, root)
	go startMinerUSyncLoop(ingestionService)

	host := env("HOST", "0.0.0.0")
	port := env("PORT", "4000")
	addr := host + ":" + port
	log.Printf("Paper Reading Go API listening on http://%s", addr)
	if err := http.ListenAndServe(addr, withCORS(mux)); err != nil {
		log.Fatal(err)
	}
}

func registerAPI(
	mux *http.ServeMux,
	catalogService *catalogapp.Service,
	readerService *readerapp.Service,
	annotationService *annotationapp.Service,
	chatService *chatapp.Service,
	ingestionService *ingestionapp.Service,
	importerService *importerapp.Service,
	userService *userapp.Service,
	settingsService *settingsapp.Service,
	store *persistence.JSONStore,
	objectStore *storage.LocalStore,
	frontendStorePath string,
) {
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		transport.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "service": "go-ddd"})
	})

	registerFrontendStore(mux, frontendStorePath)
	cataloghttp.Register(mux, catalogService)
	readerhttp.Register(mux, readerService)
	annotationhttp.Register(mux, annotationService)
	chathttp.Register(mux, chatService)
	ingestionhttp.Register(mux, ingestionService)
	userhttp.Register(mux, userService)
	settingshttp.Register(mux, settingsService, userService)
	mux.HandleFunc("POST /api/papers/{paperID}/files", ingestionhttp.UploadHandler(ingestionService))
	mux.HandleFunc("POST /api/papers/upload", ingestionhttp.UploadHandler(ingestionService))
	mux.HandleFunc("POST /api/papers/arxiv", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			ArxivID string `json:"arxiv_id"`
		}
		if err := transport.DecodeJSON(r, &body); err != nil {
			transport.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		result, err := importerService.ImportArxivHTML(body.ArxivID, "local")
		if err != nil {
			transport.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusCreated, result)
	})
	mux.HandleFunc("POST /api/translate", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Text       string `json:"text"`
			TargetLang string `json:"target_lang"`
		}
		if err := transport.DecodeJSON(r, &body); err != nil {
			transport.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusOK, map[string]any{"translation": "【译文】" + body.Text})
	})
	mux.HandleFunc("GET /api/admin/users", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireAdmin(w, r, userService); !ok {
			return
		}
		users, err := userService.Users()
		if err != nil {
			transport.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusOK, map[string]any{"users": users})
	})
	mux.HandleFunc("DELETE /api/admin/users/{userID}", func(w http.ResponseWriter, r *http.Request) {
		admin, ok := requireAdmin(w, r, userService)
		if !ok {
			return
		}
		userID := r.PathValue("userID")
		if userID == admin.ID {
			transport.WriteError(w, http.StatusBadRequest, "cannot delete current user")
			return
		}
		if err := userService.DeleteUser(userID); err != nil {
			transport.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
	})
	mux.HandleFunc("GET /api/admin/papers", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireAdmin(w, r, userService); !ok {
			return
		}
		papers, err := catalogService.List(catalogapp.ListFilter{})
		if err != nil {
			transport.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusOK, map[string]any{"papers": papers})
	})
	mux.HandleFunc("GET /api/admin/annotations", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireAdmin(w, r, userService); !ok {
			return
		}
		payload, err := annotationService.ListAll()
		if err != nil {
			transport.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusOK, payload)
	})
	mux.HandleFunc("GET /api/papers/{paperID}/content-manifest", func(w http.ResponseWriter, r *http.Request) {
		payload, err := readerService.ContentManifest(r.PathValue("paperID"))
		if err != nil {
			transport.WriteError(w, http.StatusNotFound, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusOK, payload)
	})
	mux.HandleFunc("GET /api/papers/{paperID}/blocks", func(w http.ResponseWriter, r *http.Request) {
		payload, err := readerService.Blocks(r.PathValue("paperID"), r.URL.Query().Get("chunk"))
		if err != nil {
			transport.WriteError(w, http.StatusNotFound, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusOK, payload)
	})
	mux.HandleFunc("GET /api/papers/{paperID}/annotations", func(w http.ResponseWriter, r *http.Request) {
		payload, err := annotationService.List(r.PathValue("paperID"))
		if err != nil {
			transport.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusOK, payload)
	})
	mux.HandleFunc("POST /api/parse-jobs/{jobID}/retry", func(w http.ResponseWriter, r *http.Request) {
		job, err := ingestionService.RetryJob(r.PathValue("jobID"))
		if err != nil {
			transport.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusOK, map[string]any{"job": job})
	})
	mux.HandleFunc("GET /api/assets/{objectKey...}", func(w http.ResponseWriter, r *http.Request) {
		key := r.PathValue("objectKey")
		file, err := objectStore.OpenByKey("papers", key)
		if err != nil {
			transport.WriteError(w, http.StatusNotFound, "asset not found")
			return
		}
		defer file.Close()
		contentType := mime.TypeByExtension(filepath.Ext(key))
		if contentType == "" {
			contentType = "application/octet-stream"
		}
		w.Header().Set("content-type", contentType)
		w.Header().Set("cache-control", "no-store")
		_, _ = io.Copy(w, file)
	})
	mux.HandleFunc("GET /api/papers/{paperID}/source-file", func(w http.ResponseWriter, r *http.Request) {
		object, ok, err := sourceFileObject(store, r.PathValue("paperID"))
		if err != nil {
			transport.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if !ok {
			transport.WriteError(w, http.StatusNotFound, "source file not found")
			return
		}
		file, err := objectStore.Open(object)
		if err != nil {
			transport.WriteError(w, http.StatusNotFound, "source file not found")
			return
		}
		defer file.Close()
		contentType := object.MimeType
		if contentType == "" {
			contentType = "application/pdf"
		}
		w.Header().Set("content-type", contentType)
		w.Header().Set("cache-control", "no-store")
		w.Header().Set("content-disposition", "inline")
		_, _ = io.Copy(w, file)
	})
}

func requireAdmin(w http.ResponseWriter, r *http.Request, service *userapp.Service) (userdomain.User, bool) {
	cookie, err := r.Cookie("paper_session")
	if err != nil {
		transport.WriteError(w, http.StatusForbidden, "forbidden")
		return userdomain.User{}, false
	}
	user, err := service.RequireAdmin(cookie.Value)
	if err != nil {
		transport.WriteError(w, http.StatusForbidden, err.Error())
		return userdomain.User{}, false
	}
	return user, true
}

func sourceFileObject(store *persistence.JSONStore, paperID string) (storage.Object, bool, error) {
	state, err := store.Load()
	if err != nil {
		return storage.Object{}, false, err
	}
	for _, file := range state.Files {
		if file.PaperID == paperID && file.FileKind == "original_pdf" {
			return file.Object, true, nil
		}
	}
	return storage.Object{}, false, nil
}

func registerFrontendStore(mux *http.ServeMux, storePath string) {
	mux.HandleFunc("GET /api/store", func(w http.ResponseWriter, r *http.Request) {
		payload, err := readFrontendStore(storePath)
		if err != nil {
			transport.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusOK, map[string]any{"store": payload})
	})
	mux.HandleFunc("PUT /api/store", func(w http.ResponseWriter, r *http.Request) {
		defer r.Body.Close()
		var payload map[string]any
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<20)).Decode(&payload); err != nil {
			transport.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		if err := os.MkdirAll(filepath.Dir(storePath), 0o755); err != nil {
			transport.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		data, err := json.MarshalIndent(payload, "", "  ")
		if err != nil {
			transport.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		if err := os.WriteFile(storePath, data, 0o644); err != nil {
			transport.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
	})
}

func readFrontendStore(storePath string) (map[string]any, error) {
	data, err := os.ReadFile(storePath)
	if os.IsNotExist(err) {
		return map[string]any{}, nil
	}
	if err != nil {
		return nil, err
	}
	if len(data) == 0 {
		return map[string]any{}, nil
	}
	var payload map[string]any
	if err := json.Unmarshal(data, &payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func registerStatic(mux *http.ServeMux, root string) {
	frontendDist := filepath.Join(root, "frontend", "dist")
	if stat, err := os.Stat(frontendDist); err == nil && stat.IsDir() {
		fileServer := http.FileServer(http.Dir(frontendDist))
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/" || hasPrefix(r.URL.Path, "/paper/") {
				http.ServeFile(w, r, filepath.Join(frontendDist, "index.html"))
				return
			}
			fileServer.ServeHTTP(w, r)
		})
		return
	}

	fileServer := http.FileServer(http.Dir(root))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" || hasPrefix(r.URL.Path, "/paper/") {
			http.ServeFile(w, r, filepath.Join(root, "index.html"))
			return
		}
		fileServer.ServeHTTP(w, r)
	})
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "content-type, authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func env(key string, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func hasPrefix(value string, prefix string) bool {
	return len(value) >= len(prefix) && value[:len(prefix)] == prefix
}

func startMinerUSyncLoop(service *ingestionapp.Service) {
	timer := time.NewTimer(5 * time.Second)
	defer timer.Stop()
	<-timer.C
	for {
		if result, err := service.SyncSubmittedJobs(); err != nil {
			log.Printf("MinerU sync failed: %v", err)
		} else if result.Checked > 0 {
			log.Printf("MinerU sync checked=%d updated=%d", result.Checked, len(result.Updated))
		}
		time.Sleep(30 * time.Second)
	}
}
