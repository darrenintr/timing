"""Install the native widget and launcher art into a freshly generated Capacitor project."""
from pathlib import Path
from shutil import copy2
import xml.etree.ElementTree as ET

app = Path('android/app/src/main')
source = Path('native/android')
java = app / 'java/io/github/darrenintr/timing'
java.mkdir(parents=True, exist_ok=True)
for code in source.glob('*.java'):
    copy2(code, java / code.name)
# Layouts, drawables, colours (with night variants), styles and provider info.
for resource in (source / 'res').rglob('*.xml'):
    destination = app / 'res' / resource.parent.name
    destination.mkdir(parents=True, exist_ok=True)
    copy2(resource, destination / resource.name)

for icons in (source / 'icons').glob('mipmap-*'):
    destination = app / 'res' / icons.name
    destination.mkdir(parents=True, exist_ok=True)
    for asset in icons.iterdir():
        copy2(asset, destination / asset.name)
background = app / 'res/values/ic_launcher_background.xml'
background.write_text(background.read_text().replace('#FFFFFF', '#1F6A64'))
for name in ('ic_launcher.xml', 'ic_launcher_round.xml'):
    adaptive = app / 'res/mipmap-anydpi-v26' / name
    content = adaptive.read_text()
    assert '</adaptive-icon>' in content
    adaptive.write_text(content.replace('</adaptive-icon>',
        '    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>\n</adaptive-icon>'))

ns = '{http://schemas.android.com/apk/res/android}'
ET.register_namespace('android', 'http://schemas.android.com/apk/res/android')
manifest = app / 'AndroidManifest.xml'
tree = ET.parse(manifest)
application = tree.getroot().find('application')
# The Day widget keeps the original receiver name so placed widgets survive updates.
widgets = (
    ('.TimingWidgetProvider', 'Timing · Today', 'timing_widget'),
    ('.TimingWidgetProvider$Now', 'Timing · Now', 'timing_widget_now'),
    ('.TimingWidgetProvider$Due', 'Timing · Homework count', 'timing_widget_due'),
    ('.TimingWidgetProvider$Next', 'Timing · Next lesson', 'timing_widget_next'),
    ('.TimingWidgetProvider$Timeline', 'Timing · Timeline', 'timing_widget_timeline'),
    ('.TimingWidgetProvider$Homework', 'Timing · Homework', 'timing_widget_homework'),
    ('.TimingWidgetProvider$NextDay', 'Timing · Next school day', 'timing_widget_next_day'),
)
for name, label, info in widgets:
    receiver = ET.SubElement(application, 'receiver', {
        ns + 'name': name, ns + 'exported': 'true', ns + 'label': label
    })
    filter_ = ET.SubElement(receiver, 'intent-filter')
    for action in ('android.appwidget.action.APPWIDGET_UPDATE', 'android.intent.action.DATE_CHANGED',
                   'android.intent.action.TIME_SET', 'android.intent.action.TIMEZONE_CHANGED'):
        ET.SubElement(filter_, 'action', {ns + 'name': action})
    ET.SubElement(receiver, 'meta-data', {
        ns + 'name': 'android.appwidget.provider', ns + 'resource': '@xml/' + info
    })
tree.write(manifest, encoding='utf-8', xml_declaration=True)

print('Android widgets (Today, Now, Homework count, Next lesson, Timeline, Homework, Next school day), data bridge, and Timing launcher icons installed')
