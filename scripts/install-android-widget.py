"""Install the native widget and launcher art into a freshly generated Capacitor project."""
from pathlib import Path
from shutil import copy2
import xml.etree.ElementTree as ET

app = Path('android/app/src/main')
source = Path('native/android')
java = app / 'java/io/github/darrenintr/timing'
java.mkdir(parents=True, exist_ok=True)
for name in ('MainActivity.java', 'TimingWidgetPlugin.java', 'TimingWidgetProvider.java'):
    copy2(source / name, java / name)
for folder, name, original in (
    ('xml', 'timing_widget.xml', 'timing_widget.xml'),
    ('layout', 'timing_widget.xml', 'timing_widget.xml.layout'),
    ('drawable', 'timing_widget_background.xml', 'timing_widget_background.xml'),
):
    destination = app / 'res' / folder
    destination.mkdir(parents=True, exist_ok=True)
    copy2(source / original, destination / name)

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
manifest = app / 'AndroidManifest.xml'
tree = ET.parse(manifest)
application = tree.getroot().find('application')
receiver = ET.SubElement(application, 'receiver', {
    ns + 'name': '.TimingWidgetProvider', ns + 'exported': 'true',
    ns + 'label': 'Timing timetable & homework'
})
filter_ = ET.SubElement(receiver, 'intent-filter')
for action in ('android.appwidget.action.APPWIDGET_UPDATE', 'android.intent.action.DATE_CHANGED',
               'android.intent.action.TIME_SET', 'android.intent.action.TIMEZONE_CHANGED'):
    ET.SubElement(filter_, 'action', {ns + 'name': action})
ET.SubElement(receiver, 'meta-data', {
    ns + 'name': 'android.appwidget.provider', ns + 'resource': '@xml/timing_widget'
})
tree.write(manifest, encoding='utf-8', xml_declaration=True)

strings = app / 'res/values/strings.xml'
content = strings.read_text()
assert '</resources>' in content
strings.write_text(content.replace('</resources>',
    '    <string name="timing_widget_description">Today’s timetable and upcoming homework</string>\n</resources>'))
print('Android widget receiver, data bridge, and Timing launcher icons installed')
