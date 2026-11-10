"""Native Qt shell around the shared map view, with verified local media and Issues."""
from __future__ import annotations

import hashlib
import html
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import threading
import urllib.parse
import uuid

from PySide6.QtCore import QObject, QTimer, QUrl, Qt, Signal, Slot
from PySide6.QtGui import QAction, QDesktopServices, QFont, QKeySequence
from PySide6.QtWidgets import (
    QApplication, QCheckBox, QComboBox, QDialog, QDialogButtonBox,
    QFileDialog, QHBoxLayout, QLabel, QListWidget, QMainWindow, QMessageBox,
    QPlainTextEdit, QPushButton, QSlider, QSplitter, QTextBrowser, QToolBar,
    QVBoxLayout, QWidget,
)
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineSettings
from PySide6.QtWebEngineWidgets import QWebEngineView

from dealer_map_io import (
    ISSUE_URL, export_web, fetch_github, github_head, issue_draft, load_local,
    load_saved, local_fingerprint, post_issue_comment, public_model, safe_public_url,
    utc_now, verified_media,
)
from dealer_map_sequence import plan_sequence, suggest_p1_sequence

STYLE = """
QMainWindow, QDialog { background: #f4f6f8; color: #172b3c; }
QToolBar { background: #102330; border: 0; padding: 8px; spacing: 7px; }
QToolBar QToolButton { color: #e7f0f4; background: #203744; border: 1px solid #38515c;
 padding: 8px 11px; border-radius: 7px; }
QToolBar QToolButton:hover { background: #31515e; }
QToolBar QLabel, QToolBar QCheckBox { color: #dae8ec; padding: 4px; }
QPushButton { background: #ffffff; color: #172b3c; border: 1px solid #cdd9df;
 border-radius: 7px; padding: 8px 13px; }
QPushButton:hover { border-color: #007d72; background: #eaf7f3; }
QPushButton:disabled { color: #99a7ad; background: #edf0f2; }
QPushButton[primary="true"] { background: #007d72; color: white; border: 0; }
QPlainTextEdit, QTextBrowser, QListWidget, QComboBox {
 background: white; border: 1px solid #d3dfe5; border-radius: 8px; padding: 8px; }
QLabel { color: #243a49; }
QStatusBar { background: #ecf1f4; color: #3d5361; padding: 4px; }
QSlider::groove:horizontal { background: #d6e2e5; height: 5px; border-radius: 2px; }
QSlider::handle:horizontal { background: #007d72; width: 13px; margin: -5px 0; border-radius: 6px; }
"""


class SharedMapServer:
    """One loopback-only, read-only server; it stops with the desktop window."""

    def __init__(self, model, bundle):
        self.model = model
        self.template = (bundle / "web/index.html").read_bytes()
        self._model_bytes = b""
        self.update(model)
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                port = self.server.server_port
                if self.headers.get("Host") not in (f"127.0.0.1:{port}", f"localhost:{port}"):
                    self.send_error(403)
                    return
                path = urllib.parse.urlsplit(self.path).path
                if path in ("/", "/index.html"):
                    payload, content_type = owner.template, "text/html; charset=utf-8"
                elif path == "/dealer-map.json":
                    payload, content_type = owner._model_bytes, "application/json; charset=utf-8"
                elif path == "/favicon.ico":
                    self.send_response(204)
                    self.end_headers()
                    return
                else:
                    self.send_error(404)
                    return
                etag = '"' + hashlib.sha256(payload).hexdigest() + '"'
                if self.headers.get("If-None-Match") == etag:
                    self.send_response(304)
                    self.end_headers()
                    return
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(payload)))
                self.send_header("Cache-Control", "no-cache")
                self.send_header("ETag", etag)
                self.send_header("X-Content-Type-Options", "nosniff")
                self.send_header("Referrer-Policy", "no-referrer")
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, *_):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        self.url = f"http://127.0.0.1:{self.server.server_port}/"
        self.thread = threading.Thread(target=self.server.serve_forever,
                                       kwargs={"poll_interval": 0.2}, daemon=True)
        self.thread.start()

    def update(self, model):
        self.model = model
        self._model_bytes = json.dumps(public_model(model), ensure_ascii=False).encode("utf-8")

    def close(self):
        self.server.shutdown()
        self.server.server_close()


class LinkPage(QWebEnginePage):
    def __init__(self, origin, parent=None):
        super().__init__(parent)
        self.origin = origin
        self.console_errors = []
        self._popups = []

    def acceptNavigationRequest(self, url, navigation_type, is_main_frame):
        if url.toString().startswith(self.origin) or url.toString() == "about:blank":
            return True
        if is_main_frame and navigation_type == QWebEnginePage.NavigationType.NavigationTypeLinkClicked:
            if safe_public_url(url.toString()):
                QDesktopServices.openUrl(url)
        return False

    def createWindow(self, _type):
        page = QWebEnginePage(self)
        self._popups.append(page)
        def open_once(url):
            if safe_public_url(url.toString()):
                QDesktopServices.openUrl(url)
            page.deleteLater()
            if page in self._popups:
                self._popups.remove(page)
        page.urlChanged.connect(open_once)
        return page

    def javaScriptConsoleMessage(self, level, message, line, source):
        if level == QWebEnginePage.JavaScriptConsoleMessageLevel.ErrorMessageLevel:
            self.console_errors.append(f"{line}: {message}")


class JobSignals(QObject):
    completed = Signal(str, object)
    failed = Signal(str, str)


class MovieDialog(QDialog):
    def __init__(self, path, media, title, rendered=False, parent=None):
        super().__init__(parent)
        from PySide6.QtMultimedia import QAudioOutput, QMediaPlayer
        from PySide6.QtMultimediaWidgets import QVideoWidget
        self.setWindowTitle(title + " — verifierad förhandsvisning")
        self.resize(1000, 800)
        self.player = QMediaPlayer(self)
        # Most motion references are silent. Audio is opt-in; avoid probing an
        # unavailable system sound service during a visual-only preview.
        self.audio = None
        layout = QVBoxLayout(self)
        heading = QLabel(title)
        heading.setStyleSheet("font-size:20px;font-weight:700;padding:7px")
        layout.addWidget(heading)
        self.video = QVideoWidget()
        self.video.setMinimumSize(640, 420)
        self.player.setVideoOutput(self.video)
        layout.addWidget(self.video, 1)
        kind = "Renderad granskningsfilm · separat från råkällans rutintervall" if rendered else "Råkälla · kontraktets valda intervall"
        self.info = QLabel(f"{kind}\nSHA-256 verifierad: {media.get('sha256', '')}")
        self.info.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        layout.addWidget(self.info)
        self.slider = QSlider(Qt.Orientation.Horizontal)
        layout.addWidget(self.slider)
        controls = QHBoxLayout()
        self.play_button = QPushButton("Spela / pausa")
        self.play_button.clicked.connect(self.toggle)
        controls.addWidget(self.play_button)
        self.loop = QCheckBox("Loopa vald film")
        controls.addWidget(self.loop)
        self.sound = QCheckBox("Ljud")
        self.sound.setToolTip("Aktivera ljud för filmer med ett ljudspår.")
        self.sound.toggled.connect(self.toggle_audio)
        if QApplication.platformName() in ("offscreen", "minimal"):
            self.sound.setEnabled(False)
        controls.addWidget(self.sound)
        self.clock = QLabel("00:00")
        controls.addWidget(self.clock)
        controls.addStretch()
        external = QPushButton("Öppna lokal film")
        external.clicked.connect(lambda: QDesktopServices.openUrl(QUrl.fromLocalFile(path)))
        controls.addWidget(external)
        layout.addLayout(controls)
        fps = media.get("fps") or 0
        self.start_ms = int(media.get("startFrame", 0) / fps * 1000) if fps and not rendered else 0
        end = media.get("endFrameExclusive")
        self.end_ms = int(end / fps * 1000) if fps and end is not None and not rendered else None
        self.slider.sliderMoved.connect(self.player.setPosition)
        self.player.positionChanged.connect(self.position)
        self.player.durationChanged.connect(self.duration)
        self.player.errorOccurred.connect(lambda _code, text: self.info.setText("Videospelaren: " + text))
        def loaded(status):
            if status == QMediaPlayer.MediaStatus.LoadedMedia:
                self.player.setPosition(self.start_ms)
                self.player.play()
            elif status == QMediaPlayer.MediaStatus.EndOfMedia and self.loop.isChecked():
                self.player.setPosition(self.start_ms)
                self.player.play()
        self.player.mediaStatusChanged.connect(loaded)
        self.player.setSource(QUrl.fromLocalFile(path))

    def toggle_audio(self, enabled):
        from PySide6.QtMultimedia import QAudioOutput
        if enabled and self.audio is None:
            self.audio = QAudioOutput(self)
            self.audio.setVolume(.35)
            self.player.setAudioOutput(self.audio)
        if self.audio:
            self.audio.setMuted(not enabled)

    def toggle(self):
        from PySide6.QtMultimedia import QMediaPlayer
        if self.player.playbackState() == QMediaPlayer.PlaybackState.PlayingState:
            self.player.pause()
        else:
            if self.end_ms and self.player.position() >= self.end_ms:
                self.player.setPosition(self.start_ms)
            self.player.play()

    def position(self, value):
        if not self.slider.isSliderDown():
            self.slider.setValue(value)
        self.clock.setText(f"{value / 1000:.2f} s")
        if self.end_ms and value >= self.end_ms:
            if self.loop.isChecked():
                self.player.setPosition(self.start_ms)
            else:
                self.player.pause()

    def duration(self, value):
        self.slider.setRange(self.start_ms, min(value, self.end_ms) if self.end_ms else value)

    def closeEvent(self, event):
        self.player.stop()
        event.accept()


class SequenceDialog(QDialog):
    def __init__(self, model, parent=None):
        super().__init__(parent)
        self.model = model
        self.ids = []
        self.setWindowTitle("Sekvensplanerare — kontraktskontroll")
        self.resize(960, 710)
        layout = QVBoxLayout(self)
        heading = QLabel("Sätt ihop en rörelseföljd")
        heading.setStyleSheet("font-size:22px;font-weight:700;padding:8px")
        layout.addWidget(heading)
        layout.addWidget(QLabel("Planering från källkontraktet. Skarvar och direktretur kräver egna bevis."))
        choices = QHBoxLayout()
        self.picker = QComboBox()
        for action in model.get("actions", []):
            self.picker.addItem(f"{action.get('code') or action['id']}  ·  {action['label']}  ·  {action.get('from')} → {action.get('to')}", action["id"])
        choices.addWidget(self.picker, 1)
        add = QPushButton("Lägg till")
        add.clicked.connect(self.add)
        choices.addWidget(add)
        layout.addLayout(choices)
        buttons = QHBoxLayout()
        for count in (1, 2):
            button = QPushButton(f"P1 · {count} kort · befintlig väg")
            button.clicked.connect(lambda _checked=False, n=count: self.preset(n))
            buttons.addWidget(button)
        remove = QPushButton("Ta bort vald")
        remove.clicked.connect(self.remove)
        buttons.addWidget(remove)
        clear = QPushButton("Töm")
        clear.clicked.connect(self.clear)
        buttons.addWidget(clear)
        layout.addLayout(buttons)
        split = QSplitter()
        self.list = QListWidget()
        self.report = QTextBrowser()
        split.addWidget(self.list)
        split.addWidget(self.report)
        split.setSizes([330, 560])
        layout.addWidget(split, 1)
        self.update_report()

    def add(self):
        if self.picker.currentData():
            self.ids.append(self.picker.currentData())
            self.update_report()

    def remove(self):
        row = self.list.currentRow()
        if 0 <= row < len(self.ids):
            self.ids.pop(row)
            self.update_report()

    def clear(self):
        self.ids = []
        self.update_report()

    def preset(self, cards):
        plan = suggest_p1_sequence(self.model, cards=cards)
        self.ids = [step["actionId"] for step in plan.get("steps", [])]
        self.update_report()

    def update_report(self):
        plan = plan_sequence(self.model, self.ids)
        self.list.clear()
        for step in plan["steps"]:
            self.list.addItem(f"{step['index'] + 1}. {step.get('label', step['actionId'])}\n    {step.get('from')} → {step.get('to')}")
        escaped = html.escape
        messages = "".join(f"<li>{escaped(item['message'])}</li>" for item in plan["issues"])
        count = len(plan.get("cardPlacementIds", []))
        duration = plan.get("durationSeconds")
        self.report.setHtml(
            "<h2>Planens resultat</h2>"
            f"<p><b>Slutpose:</b> {escaped(str(plan.get('finalPose')))}<br>"
            f"<b>Kortplaceringar i planen:</b> {count}<br>"
            f"<b>Retur:</b> {escaped(str(plan.get('returnMode')))}<br>"
            f"<b>Källintervallens tid:</b> {f'{duration:.2f} s' if duration is not None else 'ofullständig tidsbas'}</p>"
            "<p style='color:#a56117'><b>Sekvensen är inte spelgodkänd.</b> Denna vy skapar en plan och visar kvarvarande kontroller.</p>"
            f"<ul>{messages}</ul>"
        )


class IssueDialog(QDialog):
    def __init__(self, owner, model, action):
        super().__init__(owner)
        self.owner = owner
        self.setWindowTitle("Granskningskommentar — Issue #1")
        self.resize(860, 740)
        layout = QVBoxLayout(self)
        heading = QLabel("Skriv till HUVUDAGENT-3")
        heading.setStyleSheet("font-size:22px;font-weight:700;padding:8px")
        layout.addWidget(heading)
        layout.addWidget(QLabel("Utkastet följer vald handling och version. Du väljer själv när texten skickas."))
        self.edit = QPlainTextEdit()
        event_id = "GUI-" + uuid.uuid4().hex[:12]
        self.edit.setPlainText(issue_draft(model, action).replace("Runda: GUI-01", f"Runda: GUI-01\nHändelse-ID: {event_id}"))
        layout.addWidget(self.edit, 1)
        row = QHBoxLayout()
        copy_button = QPushButton("Kopiera och öppna GitHub")
        copy_button.clicked.connect(self.copy_open)
        row.addWidget(copy_button)
        self.send = QPushButton("Skicka via GitHub CLI")
        self.send.setProperty("primary", True)
        self.send.clicked.connect(self.publish)
        row.addWidget(self.send)
        layout.addLayout(row)
        self.result = QLabel("GitHub CLI använder sin befintliga inloggning. Inga nycklar sparas i programmet.")
        self.result.setWordWrap(True)
        layout.addWidget(self.result)

    def copy_open(self):
        QApplication.clipboard().setText(self.edit.toPlainText())
        QDesktopServices.openUrl(QUrl(ISSUE_URL + "#new_comment_field"))
        self.result.setText("Texten är kopierad. Klistra in den i Issue-tråden och skicka där.")

    def publish(self):
        body = self.edit.toPlainText().strip()
        if not body:
            return
        answer = QMessageBox.question(self, "Skicka denna kommentar?",
                                     "Texten i fönstret publiceras i scout-dealerlab Issue #1 med din gh-inloggning.",
                                     QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                                     QMessageBox.StandardButton.No)
        if answer != QMessageBox.StandardButton.Yes:
            return
        self.send.setEnabled(False)
        self.result.setText("Skickar den visade texten …")
        def success(url):
            self.result.setText("Publicerad: " + url)
        def failed(text):
            self.result.setText(text + " Kontrollera tråden före ett nytt försök.")
        self.owner.run_job("issue-post", lambda: post_issue_comment(body), success, failed)


class DealerMapWindow(QMainWindow):
    def __init__(self, model, args, bundle):
        super().__init__()
        self.model, self.args, self.bundle = model, args, bundle
        self.local_root = args.repo_root.resolve() if args.repo_root else None
        self.local_hash = local_fingerprint(self.local_root) if self.local_root else None
        self.server = SharedMapServer(model, bundle)
        self.setWindowTitle("Scout Dealer Map — rörelser, klipp och kortmål")
        self.resize(1500, 970)
        self.setMinimumSize(1120, 720)
        self.setStyleSheet(STYLE)
        self.callbacks = {}
        self.source_request = 0
        self.signals = JobSignals(self)
        self.signals.completed.connect(self._job_complete)
        self.signals.failed.connect(self._job_failed)
        self.dialogs = []
        self.closing = False
        self.web = QWebEngineView(self)
        self.page = LinkPage(self.server.url, self.web)
        self.web.setPage(self.page)
        self.web.settings().setAttribute(QWebEngineSettings.WebAttribute.JavascriptCanOpenWindows, True)
        if os.name != "nt":
            self.web.settings().setFontFamily(QWebEngineSettings.FontFamily.SansSerifFont, "DejaVu Sans")
            self.web.settings().setFontFamily(QWebEngineSettings.FontFamily.StandardFont, "DejaVu Sans")
        self.setCentralWidget(self.web)
        toolbar = QToolBar("Program", self)
        toolbar.setMovable(False)
        self.addToolBar(toolbar)
        self.toolbar = toolbar
        self._action("Öppna projekt", self.open_project, "Ctrl+O")
        self._action("Synka GitHub", self.sync_github, "Ctrl+R")
        self._action("Spela vald film", self.play_selected, "Ctrl+Space")
        self._action("Sekvens", lambda: self.current_context(self.open_sequence))
        self._action("Issue-utkast", lambda: self.current_context(self.open_issue))
        self._action("Exportera webb", lambda: self.current_context(self.choose_export))
        spacer = QWidget()
        spacer.setSizePolicy(spacer.sizePolicy().Policy.Expanding, spacer.sizePolicy().Policy.Preferred)
        toolbar.addWidget(spacer)
        self.auto = QCheckBox("Autosynk")
        self.auto.setChecked(not args.offline)
        self.auto.setToolTip("GitHub var 5:e minut. Lokal arbetskopia kontrolleras var 3:e sekund. Ingen automatisk publicering.")
        toolbar.addWidget(self.auto)
        self.status = QLabel("Läser kartan …")
        self.statusBar().addWidget(self.status, 1)
        self.statusBar().addPermanentWidget(QLabel("Läsmodell  •  inga genereringsjobb"))
        self.web.load(QUrl(self.server.url + "?desktop=1"))
        self.web.loadFinished.connect(self._loaded)
        self.timer = QTimer(self)
        self.timer.setInterval(300000)
        self.timer.timeout.connect(lambda: self.refresh() if self.auto.isChecked() and not self.local_root else None)
        self.timer.start()
        self.local_timer = QTimer(self)
        self.local_timer.setInterval(3000)
        self.local_timer.timeout.connect(self.check_local)
        self.local_timer.start()
        if not args.offline and not self.local_root:
            QTimer.singleShot(1800, self.refresh)

    def _action(self, text, callback, shortcut=None):
        action = QAction(text, self)
        if shortcut:
            action.setShortcut(QKeySequence(shortcut))
        action.triggered.connect(lambda _checked=False: callback())
        self.toolbar.addAction(action)
        return action

    def _loaded(self, ok):
        self.status.setText(self.version_text() if ok else "Kartvyn kunde inte laddas. Använd Exportera webb för separat visning.")
        if ok and self.args.screenshot:
            QTimer.singleShot(1800, self.save_screenshot)

    def save_screenshot(self):
        path = self.args.screenshot
        path.parent.mkdir(parents=True, exist_ok=True)
        self.grab().save(str(path))
        print("SCREENSHOT", path, flush=True)
        self.web.page().runJavaScript(
            "JSON.stringify({title:document.title,cards:document.querySelectorAll('button').length,loaded:!!window.dealerMapModel?.()})",
            lambda value: print("DESKTOP_STATE", value, flush=True))
        QTimer.singleShot(400, self.close)

    def version_text(self):
        p = self.model.get("provenance", {})
        label = p.get("sourceLabel", "Versionsbundet underlag")
        return f"{label}  ·  Git {(p.get('commit') or 'okänd')[:10]}  ·  Snapshot {p.get('snapshot') or p.get('reviewSnapshot') or 'lokal / ej publicerad'}"

    def run_job(self, name, function, success, failed=None):
        if name in self.callbacks:
            return
        self.callbacks[name] = (success, failed)
        self.status.setText("Arbetar: " + name + " …")
        signals = self.signals
        def run():
            try:
                value = function()
                signals.completed.emit(name, value)
            except Exception as error:
                try:
                    signals.failed.emit(name, str(error))
                except RuntimeError:
                    pass  # Window already closed. Temporary downloads are never accepted.
        threading.Thread(target=run, name="dealer-map-" + name, daemon=True).start()

    @Slot(str, object)
    def _job_complete(self, name, value):
        callback = self.callbacks.pop(name, (None, None))[0]
        if not self.closing and callback:
            callback(value)
            self.status.setText(self.version_text())

    @Slot(str, str)
    def _job_failed(self, name, message):
        callback = self.callbacks.pop(name, (None, None))[1]
        if self.closing:
            return
        self.status.setText(message)
        if callback:
            callback(message)

    def update_model(self, model, manual=False):
        self.model = model
        self.server.update(model)
        self.web.page().runJavaScript("window.dealerMapReload?.(" + ("true" if manual else "false") + ")")
        self.status.setText(self.version_text())

    def sync_github(self):
        """An explicit source switch. An older in-flight source cannot win."""
        if "GitHub" in self.callbacks:
            return
        self.source_request += 1
        serial = self.source_request
        def success(model):
            if serial != self.source_request:
                return
            self.local_root = None
            self.local_hash = None
            self.update_model(model, manual=True)
        self.run_job("GitHub", fetch_github, success)

    def refresh(self, force=False):
        if "GitHub" in self.callbacks or "lokala kontrakt" in self.callbacks:
            return
        self.source_request += 1
        serial = self.source_request
        if self.local_root:
            root = self.local_root
            self.run_job("lokala kontrakt", lambda: load_local(root),
                         lambda model: self.update_model(model, manual=force) if serial == self.source_request else None)
            return
        previous = self.model.get("provenance", {}).get("commit")
        incomplete_review = not self.model.get("provenance", {}).get("manifestVerified")
        def fetch():
            commit = github_head()
            if commit == previous and not force and not incomplete_review:
                return None
            return fetch_github(ref=commit)
        def success(result):
            if serial != self.source_request:
                return
            if result:
                self.update_model(result, manual=force)
            else:
                self.status.setText("GitHub är oförändrat · " + self.version_text())
        self.run_job("GitHub", fetch, success)

    def check_local(self):
        if not self.auto.isChecked() or not self.local_root or "lokala kontrakt" in self.callbacks:
            return
        try:
            current = local_fingerprint(self.local_root)
        except (OSError, ValueError) as error:
            self.status.setText(str(error))
            return
        if current != self.local_hash:
            self.local_hash = current
            self.refresh()

    def open_project(self):
        chosen = QFileDialog.getExistingDirectory(self, "Välj Dealerlabs projektrot")
        if not chosen:
            return
        root = Path(chosen).resolve()
        self.source_request += 1
        serial = self.source_request
        def success(model):
            if serial != self.source_request:
                return
            self.local_root = root
            self.local_hash = local_fingerprint(root)
            self.update_model(model, manual=True)
        self.run_job("öppna projekt", lambda: load_local(root), success)

    def current_context(self, callback):
        script = "JSON.stringify({model:window.dealerMapModel?.(),selection:window.dealerMapSelection?.()})"
        def receive(payload):
            try:
                data = json.loads(payload or "{}")
                model = data.get("model") or self.model
                selection = data.get("selection") or {}
                callback(model, selection.get("action"))
            except (ValueError, TypeError) as error:
                self.status.setText("Ingen kartmarkering kunde läsas: " + str(error))
        self.web.page().runJavaScript(script, receive)

    def play_selected(self):
        self.current_context(self._play_action)

    def _play_action(self, model, action):
        if not action:
            QMessageBox.information(self, "Välj en rörelse", "Markera först en rörelse eller en tagning i kartan.")
            return
        options = []
        if action.get("reviewMedia"):
            options.append(("Renderad granskningsfilm", action["reviewMedia"], True))
        if action.get("media"):
            options.append(("Råkälla · valt källintervall", action["media"], False))
        if not options:
            self.status.setText("Handlingen saknar film.")
            return
        if len(options) > 1:
            from PySide6.QtWidgets import QInputDialog
            choice, ok = QInputDialog.getItem(self, "Välj filmversion", "Råkälla och granskningsfilm har olika hash och tidsmappning.", [x[0] for x in options], 0, False)
            if not ok:
                return
            option = next(x for x in options if x[0] == choice)
        else:
            option = options[0]
        _, media, rendered = option
        def success(path):
            dialog = MovieDialog(path, media, action["label"], rendered, self)
            self.dialogs.append(dialog)
            dialog.show()
        self.run_job("verifiera film", lambda: verified_media(media, self.local_root), success,
                     lambda error: QMessageBox.information(self, "Filmen kunde inte öppnas", error))

    def open_sequence(self, model, _action=None):
        dialog = SequenceDialog(model, self)
        self.dialogs.append(dialog)
        dialog.show()

    def open_issue(self, model, action):
        dialog = IssueDialog(self, model, action)
        self.dialogs.append(dialog)
        dialog.show()

    def choose_export(self, model, _action=None):
        destination = QFileDialog.getExistingDirectory(self, "Välj mapp för webbexport")
        if not destination:
            return
        try:
            result = export_web(model, Path(destination), self.bundle)
            QMessageBox.information(self, "Webbexport klar", f"{result}\n\nExporten innehåller karta och JSON. README beskriver lokal visning och automatisk publicering.")
        except (OSError, ValueError) as error:
            self.status.setText(str(error))

    def closeEvent(self, event):
        self.closing = True
        self.timer.stop()
        self.local_timer.stop()
        for dialog in self.dialogs:
            dialog.close()
        self.web.stop()
        self.server.close()
        event.accept()


def launch(model, args, bundle):
    app = QApplication.instance() or QApplication([])
    app.setApplicationName("Scout Dealer Map")
    app.setOrganizationName("Scout Gaming")
    app.setFont(QFont("Segoe UI", 10))
    window = DealerMapWindow(model, args, bundle)
    window.show()
    return app.exec()
