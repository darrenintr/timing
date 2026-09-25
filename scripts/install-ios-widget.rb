# CocoaPods installs xcodeproj on the macOS runner. Capacitor recreates this
# project on every build, so add the extension and App Group after `cap add ios`.
require 'xcodeproj'
require 'fileutils'

project_path = 'ios/App/App.xcodeproj'
project = Xcodeproj::Project.open(project_path)
app = project.targets.find { |target| target.name == 'App' }
abort 'Capacitor App target not found' unless app

app_folder = 'ios/App/App'
widget_folder = 'ios/App/TimingWidget'
FileUtils.mkdir_p(widget_folder)
%w[TimingWidgetPlugin.swift TimingViewController.swift Timing.entitlements].each do |name|
  FileUtils.cp("native/ios/#{name}", "#{app_folder}/#{name}")
end
FileUtils.cp('native/ios/TimingWidget.swift', "#{widget_folder}/TimingWidget.swift")
FileUtils.cp('native/ios/TimingWidget-Info.plist', "#{widget_folder}/Info.plist")
FileUtils.cp('native/ios/Timing.entitlements', "#{widget_folder}/Timing.entitlements")
FileUtils.cp('native/ios/AppIcon-1024.png', "#{app_folder}/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png")

app_group = project.main_group['App'] || abort('App group not found')
%w[TimingWidgetPlugin.swift TimingViewController.swift].each do |name|
  ref = app_group.new_file(name)
  app.source_build_phase.add_file_reference(ref)
end
widget_group = project.main_group.new_group('TimingWidget', 'TimingWidget')
widget_ref = widget_group.new_file('TimingWidget.swift')
# Interactive widgets (App Intent check buttons) need iOS 17; the app itself keeps Capacitor's minimum.
widget = project.new_target(:app_extension, 'TimingWidget', :ios, '17.0')
widget.source_build_phase.add_file_reference(widget_ref)

app.build_configurations.each do |configuration|
  configuration.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/Timing.entitlements'
end
widget.build_configurations.each do |configuration|
  configuration.build_settings.merge!({
    'PRODUCT_BUNDLE_IDENTIFIER' => 'io.github.darrenintr.timing.widget',
    'PRODUCT_NAME' => '$(TARGET_NAME)',
    'CURRENT_PROJECT_VERSION' => '1',
    'MARKETING_VERSION' => '1.0',
    'SWIFT_VERSION' => '5.0',
    'IPHONEOS_DEPLOYMENT_TARGET' => '17.0',
    'TARGETED_DEVICE_FAMILY' => '1,2',
    'INFOPLIST_FILE' => 'TimingWidget/Info.plist',
    'CODE_SIGN_ENTITLEMENTS' => 'TimingWidget/Timing.entitlements',
    'APPLICATION_EXTENSION_API_ONLY' => 'YES',
    'LD_RUNPATH_SEARCH_PATHS' => '$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks',
    'SKIP_INSTALL' => 'YES'
  })
end

embed = app.new_copy_files_build_phase('Embed App Extensions')
embed.dst_subfolder_spec = '13'
embed.add_file_reference(widget.product_reference)
app.add_dependency(widget)
project.save

# Widget taps open timing://today, timing://homework/<id> and timing://homework/new.
info_path = "#{app_folder}/Info.plist"
info = Xcodeproj::Plist.read_from_path(info_path)
info['CFBundleURLTypes'] = (info['CFBundleURLTypes'] || []) + [{
  'CFBundleURLName' => 'io.github.darrenintr.timing', 'CFBundleURLSchemes' => ['timing']
}]
Xcodeproj::Plist.write_to_path(info, info_path)

storyboard = "#{app_folder}/Base.lproj/Main.storyboard"
content = File.read(storyboard)
old = 'customClass="CAPBridgeViewController" customModule="Capacitor"'
abort 'Capacitor bridge controller not found' unless content.include?(old)
File.write(storyboard, content.sub(old, 'customClass="TimingViewController" customModule="App"'))
puts 'iOS WidgetKit widgets, timing:// links, shared App Group, bridge, and Timing icon installed'
