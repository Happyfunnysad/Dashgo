package utils

import (
	"net"
	"strings"
)

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
