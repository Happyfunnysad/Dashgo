package sys

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"docker-dashboard/internal/models"
)

// procRoot allows reading host metrics from inside a container
// via mounted /host/proc. Falls back to /proc for bare-metal.
func procRoot() string {
	if _, err := os.Stat("/host/proc"); err == nil {
		return "/host/proc"
	}
	return "/proc"
}

func sysRoot() string {
	if _, err := os.Stat("/host/sys"); err == nil {
		return "/host/sys"
	}
	return "/sys"
}

// GetHardwareStats reads CPU, Memory, Disk and Temperature from the host.
func GetHardwareStats() (*models.HardwareStats, error) {
	stats := &models.HardwareStats{}

	// --- CPU ---
	// Load averages (informational; NOT used as CPU% — LA is task queue length, not utilisation)
	loadavg, err := os.ReadFile(filepath.Join(procRoot(), "loadavg"))
	if err == nil {
		parts := strings.Fields(string(loadavg))
		if len(parts) >= 3 {
			stats.LoadAvg1, _ = strconv.ParseFloat(parts[0], 64)
			stats.LoadAvg5, _ = strconv.ParseFloat(parts[1], 64)
			stats.LoadAvg15, _ = strconv.ParseFloat(parts[2], 64)
		}
	}

	// CPU count from /proc/cpuinfo
	cpuinfo, err := os.ReadFile(filepath.Join(procRoot(), "cpuinfo"))
	if err == nil {
		stats.CPUCores = strings.Count(string(cpuinfo), "processor\t:")
		if stats.CPUCores == 0 {
			// ARM kernels may use different formatting
			stats.CPUCores = strings.Count(string(cpuinfo), "processor\t")
		}
		if stats.CPUCores == 0 {
			stats.CPUCores = 1
		}
	}

	// CPU usage percentage — two-sample /proc/stat delta (accurate, not load-average).
	if pct, err := cpuUsagePercent(procRoot()); err == nil {
		stats.CPUUsagePercent = pct
	}

	// --- Memory ---
	meminfo, err := os.ReadFile(filepath.Join(procRoot(), "meminfo"))
	if err == nil {
		lines := strings.Split(string(meminfo), "\n")
		mem := make(map[string]uint64)
		for _, line := range lines {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				key := strings.TrimSuffix(parts[0], ":")
				val, _ := strconv.ParseUint(parts[1], 10, 64)
				mem[key] = val * 1024 // kB -> bytes
			}
		}
		stats.MemoryTotalBytes = mem["MemTotal"]
		stats.MemoryAvailableBytes = mem["MemAvailable"]
		if stats.MemoryTotalBytes > 0 {
			stats.MemoryUsedBytes = stats.MemoryTotalBytes - stats.MemoryAvailableBytes
			stats.MemoryUsagePercent = float64(stats.MemoryUsedBytes) / float64(stats.MemoryTotalBytes) * 100.0
		}
	}

	// --- Disk ---
	// Check common root mount points
	for _, mountPoint := range []string{"/host", "/"} {
		var statfs syscall.Statfs_t
		if err := syscall.Statfs(mountPoint, &statfs); err == nil {
			stats.DiskTotalBytes = statfs.Blocks * uint64(statfs.Bsize)
			stats.DiskFreeBytes = statfs.Bavail * uint64(statfs.Bsize)
			if stats.DiskTotalBytes > 0 {
				stats.DiskUsedBytes = stats.DiskTotalBytes - stats.DiskFreeBytes
				stats.DiskUsagePercent = float64(stats.DiskUsedBytes) / float64(stats.DiskTotalBytes) * 100.0
			}
			break
		}
	}

	// --- Temperature ---
	thermalBase := filepath.Join(sysRoot(), "class", "thermal")
	zones, err := os.ReadDir(thermalBase)
	if err == nil {
		for _, zone := range zones {
			if !strings.HasPrefix(zone.Name(), "thermal_zone") {
				continue
			}
			tempFile := filepath.Join(thermalBase, zone.Name(), "temp")
			data, err := os.ReadFile(tempFile)
			if err != nil {
				continue
			}
			raw, err := strconv.ParseFloat(strings.TrimSpace(string(data)), 64)
			if err != nil {
				continue
			}
			temp := raw / 1000.0 // millidegrees -> degrees

			// Read zone type for label
			label := zone.Name()
			typeFile := filepath.Join(thermalBase, zone.Name(), "type")
			typeData, err := os.ReadFile(typeFile)
			if err == nil {
				label = strings.TrimSpace(string(typeData))
			}

			stats.Temperatures = append(stats.Temperatures, models.ThermalZone{
				Zone:        zone.Name(),
				Label:       label,
				Temperature: temp,
			})

			// Use the highest temp as the main CPU temp
			if temp > stats.CPUTempCelsius {
				stats.CPUTempCelsius = temp
			}
		}
	}

	// --- Uptime ---
	uptimeData, err := os.ReadFile(filepath.Join(procRoot(), "uptime"))
	if err == nil {
		parts := strings.Fields(string(uptimeData))
		if len(parts) >= 1 {
			stats.UptimeSeconds, _ = strconv.ParseFloat(parts[0], 64)
		}
	}

	// --- Hostname ---
	hostname, err := os.ReadFile(filepath.Join(procRoot(), "sys", "kernel", "hostname"))
	if err == nil {
		stats.Hostname = strings.TrimSpace(string(hostname))
	} else {
		stats.Hostname, _ = os.Hostname()
	}

	// --- Kernel ---
	version, err := os.ReadFile(filepath.Join(procRoot(), "version"))
	if err == nil {
		parts := strings.Fields(string(version))
		if len(parts) >= 3 {
			stats.KernelVersion = parts[2]
		}
	}

	// Format uptime
	if stats.UptimeSeconds > 0 {
		secs := int(stats.UptimeSeconds)
		days := secs / 86400
		hours := (secs % 86400) / 3600
		minutes := (secs % 3600) / 60
		if days > 0 {
			stats.UptimeFormatted = fmt.Sprintf("%dd %dh %dm", days, hours, minutes)
		} else if hours > 0 {
			stats.UptimeFormatted = fmt.Sprintf("%dh %dm", hours, minutes)
		} else {
			stats.UptimeFormatted = fmt.Sprintf("%dm", minutes)
		}
	}

	return stats, nil
}

// cpuStat holds the raw counters from a single /proc/stat "cpu" line.
type cpuStat struct {
	user, nice, system, idle, iowait, irq, softirq, steal uint64
}

func readCPUStat(procRoot string) (cpuStat, error) {
	data, err := os.ReadFile(filepath.Join(procRoot, "stat"))
	if err != nil {
		return cpuStat{}, err
	}
	for _, line := range strings.SplitN(string(data), "\n", 10) {
		if !strings.HasPrefix(line, "cpu ") {
			continue
		}
		fields := strings.Fields(line)
		// fields: ["cpu", user, nice, system, idle, iowait, irq, softirq, steal, ...]
		if len(fields) < 9 {
			break
		}
		parse := func(s string) uint64 {
			v, _ := strconv.ParseUint(s, 10, 64)
			return v
		}
		return cpuStat{
			user:    parse(fields[1]),
			nice:    parse(fields[2]),
			system:  parse(fields[3]),
			idle:    parse(fields[4]),
			iowait:  parse(fields[5]),
			irq:     parse(fields[6]),
			softirq: parse(fields[7]),
			steal:   parse(fields[8]),
		}, nil
	}
	return cpuStat{}, fmt.Errorf("cpu line not found in %s/stat", procRoot)
}

// cpuUsagePercent returns real CPU utilisation by sampling /proc/stat twice
// with a 200 ms interval. This is physically correct unlike loadavg/cores.
func cpuUsagePercent(procRoot string) (float64, error) {
	s1, err := readCPUStat(procRoot)
	if err != nil {
		return 0, err
	}
	time.Sleep(200 * time.Millisecond)
	s2, err := readCPUStat(procRoot)
	if err != nil {
		return 0, err
	}

	idle1 := s1.idle + s1.iowait
	total1 := s1.user + s1.nice + s1.system + idle1 + s1.irq + s1.softirq + s1.steal

	idle2 := s2.idle + s2.iowait
	total2 := s2.user + s2.nice + s2.system + idle2 + s2.irq + s2.softirq + s2.steal

	totalDelta := float64(total2 - total1)
	idleDelta := float64(idle2 - idle1)

	if totalDelta <= 0 {
		return 0, nil
	}
	pct := (1.0 - idleDelta/totalDelta) * 100.0
	if pct < 0 {
		pct = 0
	}
	if pct > 100 {
		pct = 100
	}
	return pct, nil
}
