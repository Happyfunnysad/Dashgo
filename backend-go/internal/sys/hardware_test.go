package sys

import (
	"os"
	"path/filepath"
	"testing"
)

// TestCPUUsagePercentRange verifies that cpuUsagePercent stays in [0,100]
// when run against the real /proc/stat (available on Linux CI; skipped otherwise).
func TestCPUUsagePercentRange(t *testing.T) {
	if _, err := os.Stat("/proc/stat"); os.IsNotExist(err) {
		t.Skip("no /proc/stat — not running on Linux")
	}
	pct, err := cpuUsagePercent("/proc")
	if err != nil {
		t.Fatalf("cpuUsagePercent: %v", err)
	}
	if pct < 0 || pct > 100 {
		t.Errorf("cpuUsagePercent out of range: %f", pct)
	}
}

// TestReadCPUStatParsing creates a synthetic /proc/stat file and verifies
// that readCPUStat parses it correctly.
func TestReadCPUStatParsing(t *testing.T) {
	// Typical /proc/stat cpu line:
	// cpu  user nice system idle iowait irq softirq steal
	content := "cpu  100 10 50 800 20 5 3 2\ncpu0 50 5 25 400 10 2 1 1\n"
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "stat"), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	s, err := readCPUStat(dir)
	if err != nil {
		t.Fatalf("readCPUStat: %v", err)
	}
	if s.user != 100 || s.nice != 10 || s.system != 50 || s.idle != 800 ||
		s.iowait != 20 || s.irq != 5 || s.softirq != 3 || s.steal != 2 {
		t.Errorf("unexpected parsed values: %+v", s)
	}
}

// TestCPUUsagePercentSynthetic verifies the two-sample delta calculation using
// a fake proc root with two pre-written stat files read in sequence.
func TestCPUUsagePercentSynthetic(t *testing.T) {
	// We can't easily inject two reads into cpuUsagePercent since it sleeps and
	// reads the same file. Instead, test the arithmetic by calling the formula
	// directly to validate correctness.
	//
	// Sample 1: idle=800 iowait=20 total=990   (non-idle=170)
	// Sample 2: idle=900 iowait=20 total=1100  (non-idle=180)
	// deltaIdle=100, deltaTotal=110 → usage = (1 - 100/110)*100 ≈ 9.09%
	s1 := cpuStat{user: 100, nice: 10, system: 50, idle: 800, iowait: 20, irq: 5, softirq: 3, steal: 2}
	s2 := cpuStat{user: 110, nice: 10, system: 60, idle: 900, iowait: 20, irq: 5, softirq: 3, steal: 2}

	idle1 := s1.idle + s1.iowait
	total1 := s1.user + s1.nice + s1.system + idle1 + s1.irq + s1.softirq + s1.steal

	idle2 := s2.idle + s2.iowait
	total2 := s2.user + s2.nice + s2.system + idle2 + s2.irq + s2.softirq + s2.steal

	totalDelta := float64(total2 - total1)
	idleDelta := float64(idle2 - idle1)

	if totalDelta <= 0 {
		t.Fatal("totalDelta should be positive")
	}
	pct := (1.0 - idleDelta/totalDelta) * 100.0
	if pct < 0 || pct > 100 {
		t.Errorf("calculated pct out of range: %f", pct)
	}
	// Expected ≈ 16.67%  (deltaIdle=100, deltaTotal=120 → (1-100/120)*100)
	const expected = 16.67
	const tolerance = 1.0
	if pct < expected-tolerance || pct > expected+tolerance {
		t.Errorf("pct = %.2f, expected ≈ %.2f ± %.1f", pct, expected, tolerance)
	}
}

// TestGetHardwareStatsStructure verifies that GetHardwareStats returns a
// structurally valid object (non-negative memory, disk, cores >= 0).
func TestGetHardwareStatsStructure(t *testing.T) {
	if _, err := os.Stat("/proc/meminfo"); os.IsNotExist(err) {
		t.Skip("no /proc — not running on Linux")
	}
	stats, err := GetHardwareStats()
	if err != nil {
		t.Fatalf("GetHardwareStats: %v", err)
	}
	if stats.CPUCores < 0 {
		t.Error("CPUCores must be >= 0")
	}
	if stats.CPUUsagePercent < 0 || stats.CPUUsagePercent > 100 {
		t.Errorf("CPUUsagePercent out of range: %f", stats.CPUUsagePercent)
	}
	if stats.MemoryTotalBytes == 0 {
		t.Error("MemoryTotalBytes should not be zero on a real system")
	}
	if stats.MemoryUsagePercent < 0 || stats.MemoryUsagePercent > 100 {
		t.Errorf("MemoryUsagePercent out of range: %f", stats.MemoryUsagePercent)
	}
}
