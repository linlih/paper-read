package http

import (
	"net/http"
	"strings"

	"paper-reading/internal/reader/application"
	transport "paper-reading/internal/shared/transport"
)

func Register(mux *http.ServeMux, service *application.Service) {
	mux.HandleFunc("GET /api/papers/{paperID}/reader", func(w http.ResponseWriter, r *http.Request) {
		payload, err := service.ReaderPayload(r.PathValue("paperID"))
		if err != nil {
			transport.WriteError(w, http.StatusNotFound, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusOK, payload)
	})

	mux.HandleFunc("/api/reader/papers/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/reader/papers/")
		parts := strings.Split(strings.Trim(path, "/"), "/")
		if len(parts) < 2 {
			return
		}
		paperID := parts[0]
		switch {
		case r.Method == http.MethodGet && parts[1] == "content-manifest":
			payload, err := service.ContentManifest(paperID)
			if err != nil {
				transport.WriteError(w, http.StatusNotFound, err.Error())
				return
			}
			transport.WriteJSON(w, http.StatusOK, payload)
		case r.Method == http.MethodGet && parts[1] == "blocks":
			payload, err := service.Blocks(paperID, r.URL.Query().Get("chunk"))
			if err != nil {
				transport.WriteError(w, http.StatusNotFound, err.Error())
				return
			}
			transport.WriteJSON(w, http.StatusOK, payload)
		default:
			// Other /api/papers/{id} routes are registered by ingestion.
		}
	})
}
