// alculator serves the API or transactionally imports a version 1 report export.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/zachpmanson/alculator/internal/catalogue"
	"github.com/zachpmanson/alculator/internal/httpapi"
	"github.com/zachpmanson/alculator/internal/reportstore"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, os.Args[1:], os.Stdin, os.Stdout, os.Getenv); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run(ctx context.Context, args []string, stdin io.Reader, stdout io.Writer, env func(string) string) error {
	if len(args) == 0 || (args[0] != "serve" && args[0] != "import") {
		return errors.New("usage: alculator serve [-db data/reports.sqlite] [-listen 127.0.0.1:3010] | import [-db data/reports.sqlite] [-input file|-]")
	}
	flags := flag.NewFlagSet(args[0], flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	dbPath := flags.String("db", "data/reports.sqlite", "SQLite report database")
	var listen, input *string
	if args[0] == "serve" {
		listen = flags.String("listen", "127.0.0.1:3010", "HTTP listen address")
	} else {
		input = flags.String("input", "-", "version 1 JSON file, or - for stdin")
	}
	if err := flags.Parse(args[1:]); err != nil || flags.NArg() != 0 {
		return errors.New("invalid command flags")
	}
	if args[0] == "import" {
		r := stdin
		if *input != "-" {
			f, err := os.Open(*input)
			if err != nil {
				return errors.New("cannot open import input")
			}
			defer f.Close()
			r = f
		}
		in, err := reportstore.DecodeImport(r)
		if err != nil {
			return err
		}
		store, err := reportstore.Open(*dbPath)
		if err != nil {
			return errors.New("cannot open reports database")
		}
		defer store.Close()
		importCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		count, err := store.Import(importCtx, in)
		if err != nil {
			return errors.New("report import failed (invalid or conflicting state)")
		}
		if err := store.Integrity(importCtx); err != nil {
			return errors.New("database integrity check failed")
		}
		next, err := store.NextID(importCtx)
		if err != nil {
			return errors.New("cannot verify allocation state")
		}
		return jsonImportResult(stdout, count, next)
	}
	password := env("REPORT_ADMIN_PASSWORD")
	if password == "" {
		return errors.New("REPORT_ADMIN_PASSWORD must be nonempty")
	}
	store, err := reportstore.Open(*dbPath)
	if err != nil {
		return errors.New("cannot open reports database")
	}
	defer store.Close()
	drinks := catalogue.New(env("DATA_REPO"), catalogue.Options{})
	handler, err := httpapi.New(store, drinks, password)
	if err != nil {
		return err
	}
	server := &http.Server{Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 45 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10}
	listener, err := net.Listen("tcp", *listen)
	if err != nil {
		return errors.New("cannot listen for HTTP")
	}
	done := make(chan error, 1)
	go func() { done <- server.Serve(listener) }()
	select {
	case err := <-done:
		if !errors.Is(err, http.ErrServerClosed) {
			return errors.New("HTTP server stopped unexpectedly")
		}
		return nil
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			_ = server.Close()
			return errors.New("HTTP shutdown timed out")
		}
		return nil
	}
}
func jsonImportResult(w io.Writer, count int, next int64) error {
	_, err := fmt.Fprintf(w, "{\"inserted\":%d,\"next_id\":%d,\"integrity\":\"ok\"}\n", count, next)
	return err
}
