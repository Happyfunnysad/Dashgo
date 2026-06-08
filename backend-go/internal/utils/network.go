package utils

import (
	"fmt"
	"net"
	"net/url"
	"strings"
)

// ValidateWebhookURL guards against SSRF: only http/https URLs that resolve to
// public, routable addresses are allowed. Loopback, private, link-local and
// unspecified addresses are rejected so an authenticated user cannot point the
// webhook at internal services or cloud metadata endpoints.
func ValidateWebhookURL(rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid webhook URL: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("webhook URL must use http or https")
	}
	host := u.Hostname()
	if host == "" {
		return fmt.Errorf("webhook URL is missing a host")
	}

	ips, err := net.LookupIP(host)
	if err != nil {
		return fmt.Errorf("cannot resolve webhook host: %w", err)
	}
	for _, ip := range ips {
		if !isPublicIP(ip) {
			return fmt.Errorf("webhook host resolves to a non-routable address (%s)", ip)
		}
	}
	return nil
}

func isPublicIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return false
	}
	return true
}

// GetLocalIP returns the first non-loopback local IPv4 address
func GetLocalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return ""
	}
	for _, address := range addrs {
		// check the address type and if it is not a loopback the display it
		if ipnet, ok := address.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				// Avoid tailscale or docker IPs for "Local"
				if !strings.HasPrefix(ipnet.IP.String(), "100.") && !strings.HasPrefix(ipnet.IP.String(), "172.") {
					return ipnet.IP.String()
				}
			}
		}
	}
	return ""
}

// GetTailscaleIP returns the Tailscale IPv4 address (usually starting with 100.)
func GetTailscaleIP() string {
	interfaces, err := net.Interfaces()
	if err != nil {
		return ""
	}

	for _, iface := range interfaces {
		if strings.Contains(strings.ToLower(iface.Name), "tailscale") || strings.Contains(strings.ToLower(iface.Name), "ts0") {
			addrs, err := iface.Addrs()
			if err != nil {
				continue
			}
			for _, addr := range addrs {
				if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
					if ipnet.IP.To4() != nil {
						return ipnet.IP.String()
					}
				}
			}
		}
	}

	// Fallback: search all interfaces for 100.x.x.x
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return ""
	}
	for _, address := range addrs {
		if ipnet, ok := address.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil && strings.HasPrefix(ipnet.IP.String(), "100.") {
				return ipnet.IP.String()
			}
		}
	}

	return ""
}
