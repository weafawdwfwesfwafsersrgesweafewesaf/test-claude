// Intégration Windows : place les fenêtres de fond d'écran derrière les icônes du bureau
// (technique WorkerW/Progman, compatible Windows 10 et Windows 11 24H2+), et surveille
// l'application au premier plan pour les règles de lecture (pause en plein écran, etc.).
// Aucun module natif : on passe par PowerShell + C# compilé à la volée.
const { spawn, spawnSync } = require('child_process');
const readline = require('readline');

const CSHARP = String.raw`
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class OWDesk {
  [DllImport("user32.dll", SetLastError=true)] static extern IntPtr FindWindow(string c, string w);
  [DllImport("user32.dll", SetLastError=true)] static extern IntPtr FindWindowEx(IntPtr p, IntPtr after, string c, string w);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr res);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern IntPtr SetParent(IntPtr child, IntPtr parent);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern int MapWindowPoints(IntPtr from, IntPtr to, ref RECT r, uint n);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int idx);
  [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr h, int idx, int v);
  [DllImport("user32.dll")] static extern bool SetLayeredWindowAttributes(IntPtr h, uint key, byte alpha, uint flags);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern bool SystemParametersInfo(uint a, uint b, string c, uint d);

  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }

  const int GWL_STYLE = -16, GWL_EXSTYLE = -20;
  const int WS_CHILD = 0x40000000, WS_EX_LAYERED = 0x80000, WS_EX_NOREDIRECTIONBITMAP = 0x200000;
  const uint SWP_NOSIZE = 0x1, SWP_NOMOVE = 0x2, SWP_NOZORDER = 0x4, SWP_NOACTIVATE = 0x10, SWP_SHOWWINDOW = 0x40;

  static IntPtr progman, workerW, defView;
  static bool raised;

  static void Setup() {
    progman = FindWindow("Progman", null);
    raised = (GetWindowLong(progman, GWL_EXSTYLE) & WS_EX_NOREDIRECTIONBITMAP) != 0;
    IntPtr res;
    // Demande à l'Explorateur de créer la couche WorkerW derrière les icônes.
    SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), new IntPtr(0x1), 0, 1000, out res);
    workerW = IntPtr.Zero; defView = IntPtr.Zero;
    EnumWindows(delegate(IntPtr top, IntPtr l) {
      IntPtr p = FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null);
      if (p != IntPtr.Zero) {
        defView = p;
        workerW = FindWindowEx(IntPtr.Zero, top, "WorkerW", null);
      }
      return true;
    }, IntPtr.Zero);
    if (raised) {
      // Windows 11 24H2+ : Progman > [SHELLDLL_DefView, WorkerW]
      workerW = FindWindowEx(progman, IntPtr.Zero, "WorkerW", null);
      if (defView == IntPtr.Zero) defView = FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
    }
  }

  public static string Attach(long handle) {
    SetProcessDPIAware();
    IntPtr hwnd = new IntPtr(handle);
    Setup();
    RECT r; GetWindowRect(hwnd, out r);
    int w = r.Right - r.Left, h = r.Bottom - r.Top;
    if (raised) {
      SetWindowLong(hwnd, GWL_STYLE, (GetWindowLong(hwnd, GWL_STYLE) & ~unchecked((int)0x80000000)) | WS_CHILD);
      SetWindowLong(hwnd, GWL_EXSTYLE, GetWindowLong(hwnd, GWL_EXSTYLE) | WS_EX_LAYERED);
      SetLayeredWindowAttributes(hwnd, 0, 255, 0x2);
      SetParent(hwnd, progman);
      MapWindowPoints(IntPtr.Zero, progman, ref r, 2);
      SetWindowPos(hwnd, defView, r.Left, r.Top, w, h, SWP_NOACTIVATE | SWP_SHOWWINDOW);
      if (workerW != IntPtr.Zero) SetWindowPos(workerW, new IntPtr(1), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
      return "ok:raised";
    }
    if (workerW == IntPtr.Zero) return "fail:noworkerw";
    SetParent(hwnd, workerW);
    MapWindowPoints(IntPtr.Zero, workerW, ref r, 2);
    SetWindowPos(hwnd, IntPtr.Zero, r.Left, r.Top, w, h, SWP_NOACTIVATE | SWP_NOZORDER | SWP_SHOWWINDOW);
    return "ok:workerw";
  }

  public static void Refresh() {
    progman = FindWindow("Progman", null);
    bool r = (GetWindowLong(progman, GWL_EXSTYLE) & WS_EX_NOREDIRECTIONBITMAP) != 0;
    if (!r) SystemParametersInfo(0x14, 0, null, 0x1);
  }

  // pid|estBureau|maximisée|pleinÉcran
  public static string Probe() {
    IntPtr fg = GetForegroundWindow();
    if (fg == IntPtr.Zero) return "0|1|0|0";
    uint pid; GetWindowThreadProcessId(fg, out pid);
    StringBuilder sb = new StringBuilder(256); GetClassName(fg, sb, 256);
    string cls = sb.ToString();
    bool desk = cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd" || cls == "Shell_SecondaryTrayWnd"
      || cls == "NotifyIconOverflowWindow" || cls == "TopLevelWindowForOverflowXamlIsland" || cls == "XamlExplorerHostIslandWindow";
    bool max = !desk && IsZoomed(fg);
    bool full = false;
    if (!desk && IsWindowVisible(fg)) {
      RECT r; GetWindowRect(fg, out r);
      MONITORINFO mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
      if (GetMonitorInfo(MonitorFromWindow(fg, 2), ref mi))
        full = r.Left <= mi.rcMonitor.Left && r.Top <= mi.rcMonitor.Top && r.Right >= mi.rcMonitor.Right && r.Bottom >= mi.rcMonitor.Bottom;
    }
    return pid + "|" + (desk ? 1 : 0) + "|" + (max ? 1 : 0) + "|" + (full ? 1 : 0);
  }
}
`;

function encode(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function psArgs(body) {
  const script = `$ErrorActionPreference='Stop'\nAdd-Type -TypeDefinition @'\n${CSHARP}\n'@\n${body}`;
  return ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', encode(script)];
}

function hwndOf(win) {
  const buf = win.getNativeWindowHandle();
  return buf.length >= 8 ? buf.readBigUInt64LE(0).toString() : String(buf.readUInt32LE(0));
}

/** Attache une BrowserWindow au bureau (derrière les icônes). */
function attachToDesktop(win) {
  return new Promise((resolve) => {
    const hwnd = hwndOf(win);
    const ps = spawn('powershell.exe', psArgs(`[Console]::Out.Write([OWDesk]::Attach(${hwnd}))`), { windowsHide: true });
    let out = '';
    ps.stdout.on('data', (d) => (out += d));
    ps.stderr.on('data', (d) => (out += d));
    ps.on('error', (e) => resolve('fail:' + e.message));
    ps.on('close', () => resolve(out.trim()));
  });
}

/** Force le rafraîchissement du fond d'écran Windows (efface la dernière image d'un fond retiré). */
function refreshDesktop(sync = false) {
  try {
    if (sync) spawnSync('powershell.exe', psArgs('[OWDesk]::Refresh()'), { windowsHide: true, timeout: 8000 });
    else spawn('powershell.exe', psArgs('[OWDesk]::Refresh()'), { windowsHide: true }).on('error', () => {});
  } catch {
    /* ignore */
  }
}

/**
 * Surveille la fenêtre au premier plan. `onState({pid, desktop, maximized, fullscreen})` est appelé chaque seconde.
 * Retourne une fonction pour arrêter la surveillance.
 */
function watchForeground(onState) {
  const body = `$pp=${process.pid}
while ($true) {
  [Console]::Out.WriteLine([OWDesk]::Probe()); [Console]::Out.Flush()
  if (-not (Get-Process -Id $pp -ErrorAction SilentlyContinue)) { exit }
  Start-Sleep -Milliseconds 1000
}`;
  let ps;
  let stopped = false;
  const start = () => {
    ps = spawn('powershell.exe', psArgs(body), { windowsHide: true });
    readline.createInterface({ input: ps.stdout }).on('line', (line) => {
      const [pid, desk, max, full] = line.trim().split('|');
      if (pid === undefined || full === undefined) return;
      onState({ pid: Number(pid), desktop: desk === '1', maximized: max === '1', fullscreen: full === '1' });
    });
    ps.on('error', () => {});
    ps.on('exit', () => {
      if (!stopped) setTimeout(start, 5000);
    });
  };
  start();
  return () => {
    stopped = true;
    try { ps.kill(); } catch { /* ignore */ }
  };
}

module.exports = { attachToDesktop, refreshDesktop, watchForeground, hwndOf, CSHARP };
