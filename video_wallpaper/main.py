"""
Video Wallpaper - un "Wallpaper Engine" gratuit et minimaliste pour Windows.

Affiche une video en boucle comme fond d'ecran anime, derriere les icones
du bureau (technique WorkerW, comme le vrai Wallpaper Engine).

Depose tes propres fichiers .mp4 / .webm / .mkv dans le dossier "wallpapers/"
situe a cote de ce script, puis lance l'app. Une icone apparait dans la zone
de notification (en bas a droite) pour changer de wallpaper, couper le son ou
quitter.

Usage :
    pip install -r requirements.txt
    python main.py
"""

from __future__ import annotations

import ctypes
import json
import sys
from ctypes import wintypes
from pathlib import Path

from PySide6.QtCore import Qt, QUrl
from PySide6.QtGui import QAction, QIcon, QPixmap, QPainter, QColor
from PySide6.QtMultimedia import QAudioOutput, QMediaPlayer
from PySide6.QtMultimediaWidgets import QVideoWidget
from PySide6.QtWidgets import (
    QApplication,
    QMenu,
    QSystemTrayIcon,
    QWidget,
    QVBoxLayout,
)

# --- Dossiers / configuration -------------------------------------------------

APP_DIR = Path(__file__).resolve().parent
WALLPAPER_DIR = APP_DIR / "wallpapers"
CONFIG_FILE = APP_DIR / "config.json"
VIDEO_EXTS = {".mp4", ".webm", ".mkv", ".mov", ".avi", ".m4v"}


def load_config() -> dict:
    try:
        return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_config(cfg: dict) -> None:
    try:
        CONFIG_FILE.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    except OSError:
        pass


def list_videos() -> list[Path]:
    if not WALLPAPER_DIR.exists():
        return []
    return sorted(
        p for p in WALLPAPER_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in VIDEO_EXTS
    )


# --- Technique WorkerW : placer une fenetre derriere les icones du bureau -----

def attach_to_desktop(hwnd: int) -> bool:
    """Reparente la fenetre hwnd derriere les icones du bureau.

    Windows gere le bureau via "Progman". On lui envoie un message cache
    (0x052C) qui provoque la creation d'une fenetre "WorkerW" placee juste
    derriere la couche des icones. On attache notre fenetre a ce WorkerW :
    la video s'affiche alors en fond, sans masquer les icones.
    """
    user32 = ctypes.windll.user32

    progman = user32.FindWindowW("Progman", None)
    if not progman:
        return False

    # Demande a Progman de generer le WorkerW (timeout 1s).
    result = wintypes.DWORD()
    user32.SendMessageTimeoutW(
        progman, 0x052C, 0, 0, 0x0000, 1000, ctypes.byref(result)
    )

    # Parcourt les fenetres pour trouver le WorkerW situe derriere les icones.
    workerw = wintypes.HWND(0)

    EnumWindowsProc = ctypes.WINFUNCTYPE(
        wintypes.BOOL, wintypes.HWND, wintypes.LPARAM
    )

    def _enum(top_handle, _lparam):
        nonlocal workerw
        shell = user32.FindWindowExW(
            top_handle, 0, "SHELLDLL_DefView", None
        )
        if shell:
            # Le WorkerW frere, juste apres, est la couche de fond voulue.
            workerw.value = user32.FindWindowExW(
                0, top_handle, "WorkerW", None
            )
        return True

    user32.EnumWindows(EnumWindowsProc(_enum), 0)

    if not workerw.value:
        # Repli : certaines versions de Windows exposent directement WorkerW.
        workerw.value = user32.FindWindowExW(0, 0, "WorkerW", None)
    if not workerw.value:
        return False

    user32.SetParent(wintypes.HWND(hwnd), workerw)
    return True


def restore_desktop() -> None:
    """Rafraichit le bureau pour nettoyer l'affichage a la fermeture."""
    try:
        user32 = ctypes.windll.user32
        progman = user32.FindWindowW("Progman", None)
        if progman:
            user32.InvalidateRect(progman, None, True)
    except Exception:
        pass


# --- Fenetre video ------------------------------------------------------------

class WallpaperWindow(QWidget):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowFlags(
            Qt.FramelessWindowHint
            | Qt.Tool
            | Qt.WindowStaysOnBottomHint
        )
        self.setAttribute(Qt.WA_TranslucentBackground, False)
        self.setStyleSheet("background-color: black;")

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        self.video = QVideoWidget(self)
        self.video.setAspectRatioMode(Qt.KeepAspectRatioByExpanding)
        layout.addWidget(self.video)

        self.audio = QAudioOutput()
        self.audio.setMuted(True)
        self.player = QMediaPlayer()
        self.player.setVideoOutput(self.video)
        self.player.setAudioOutput(self.audio)
        self.player.setLoops(QMediaPlayer.Infinite)

        # Couvre tout le bureau (resolution de l'ecran principal).
        screen = QApplication.primaryScreen().geometry()
        self.setGeometry(screen)

    def play(self, path: Path) -> None:
        self.player.setSource(QUrl.fromLocalFile(str(path)))
        self.player.play()

    def set_muted(self, muted: bool) -> None:
        self.audio.setMuted(muted)


# --- Icone generee (pas de fichier image a fournir) ---------------------------

def make_icon() -> QIcon:
    pix = QPixmap(64, 64)
    pix.fill(Qt.transparent)
    painter = QPainter(pix)
    painter.setRenderHint(QPainter.Antialiasing)
    painter.setBrush(QColor("#6C5CE7"))
    painter.setPen(Qt.NoPen)
    painter.drawRoundedRect(4, 4, 56, 56, 12, 12)
    painter.setBrush(QColor("white"))
    # Triangle "play"
    points = [(26, 20), (26, 44), (46, 32)]
    from PySide6.QtGui import QPolygon
    from PySide6.QtCore import QPoint
    painter.drawPolygon(QPolygon([QPoint(x, y) for x, y in points]))
    painter.end()
    return QIcon(pix)


# --- Application ---------------------------------------------------------------

class VideoWallpaperApp:
    def __init__(self) -> None:
        self.app = QApplication(sys.argv)
        self.app.setQuitOnLastWindowClosed(False)

        self.config = load_config()
        self.window = WallpaperWindow()
        self.window.set_muted(self.config.get("muted", True))

        self.tray = QSystemTrayIcon(make_icon())
        self.tray.setToolTip("Video Wallpaper")
        self.tray.setContextMenu(self._build_menu())
        self.tray.show()

        self.window.show()
        attached = attach_to_desktop(int(self.window.winId()))
        if not attached:
            self.tray.showMessage(
                "Video Wallpaper",
                "Impossible d'attacher au bureau (Windows uniquement). "
                "La fenetre s'affiche en avant-plan.",
                QSystemTrayIcon.Warning,
            )

        self._start_initial_video()

    def _build_menu(self) -> QMenu:
        menu = QMenu()

        videos = list_videos()
        if videos:
            for path in videos:
                action = QAction(path.name, menu)
                action.triggered.connect(
                    lambda _checked=False, p=path: self.select_video(p)
                )
                menu.addAction(action)
        else:
            empty = QAction("(aucune video dans wallpapers/)", menu)
            empty.setEnabled(False)
            menu.addAction(empty)

        menu.addSeparator()

        self.mute_action = QAction("Son coupe", menu)
        self.mute_action.setCheckable(True)
        self.mute_action.setChecked(self.config.get("muted", True))
        self.mute_action.triggered.connect(self.toggle_mute)
        menu.addAction(self.mute_action)

        refresh = QAction("Rafraichir la liste", menu)
        refresh.triggered.connect(self.refresh_menu)
        menu.addAction(refresh)

        menu.addSeparator()

        quit_action = QAction("Quitter", menu)
        quit_action.triggered.connect(self.quit)
        menu.addAction(quit_action)

        return menu

    def refresh_menu(self) -> None:
        self.tray.setContextMenu(self._build_menu())

    def _start_initial_video(self) -> None:
        videos = list_videos()
        if not videos:
            self.tray.showMessage(
                "Video Wallpaper",
                f"Depose des fichiers video dans :\n{WALLPAPER_DIR}",
                QSystemTrayIcon.Information,
            )
            return
        last = self.config.get("last")
        chosen = next((p for p in videos if p.name == last), videos[0])
        self.window.play(chosen)

    def select_video(self, path: Path) -> None:
        self.window.play(path)
        self.config["last"] = path.name
        save_config(self.config)

    def toggle_mute(self, checked: bool) -> None:
        self.window.set_muted(checked)
        self.config["muted"] = checked
        save_config(self.config)

    def quit(self) -> None:
        self.window.player.stop()
        self.tray.hide()
        restore_desktop()
        self.app.quit()

    def run(self) -> int:
        return self.app.exec()


def main() -> int:
    WALLPAPER_DIR.mkdir(exist_ok=True)
    return VideoWallpaperApp().run()


if __name__ == "__main__":
    sys.exit(main())
