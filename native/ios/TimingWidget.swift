import SwiftUI
import WidgetKit

private struct Lesson: Decodable, Identifiable {
    let period: Int
    let subject: String
    let time: String
    var id: Int { period }
}
private struct SchoolDay: Decodable {
    let date: String
    let cycle: String?
    let label: String
    let lessons: [Lesson]
}
private struct Homework: Decodable {
    let title: String
    let subject: String
    let date: String?
    let period: Int?
}
private struct Snapshot: Decodable {
    let days: [SchoolDay]
    let homework: [Homework]

    static func stored() -> Snapshot? {
        guard let text = UserDefaults(suiteName: "group.io.github.darrenintr.timing")?.string(forKey: "snapshot"),
              let data = text.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(Snapshot.self, from: data)
    }
}

private let hongKong = TimeZone(identifier: "Asia/Hong_Kong")!
private func dateKey(_ date: Date) -> String {
    let format = DateFormatter()
    format.timeZone = hongKong
    format.dateFormat = "yyyy-MM-dd"
    return format.string(from: date)
}
private func displayDate(_ date: Date) -> String {
    let format = DateFormatter()
    format.timeZone = hongKong
    format.dateFormat = "EEEE, d MMMM"
    return format.string(from: date)
}

private struct ScheduleEntry: TimelineEntry {
    let date: Date
    let snapshot: Snapshot?
    var day: SchoolDay? { snapshot?.days.first { $0.date == dateKey(date) } }
}

private struct ScheduleProvider: TimelineProvider {
    func placeholder(in context: Context) -> ScheduleEntry { ScheduleEntry(date: Date(), snapshot: nil) }
    func getSnapshot(in context: Context, completion: @escaping (ScheduleEntry) -> Void) {
        completion(ScheduleEntry(date: Date(), snapshot: Snapshot.stored()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<ScheduleEntry>) -> Void) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = hongKong
        let start = calendar.startOfDay(for: Date())
        let snapshot = Snapshot.stored()
        let dates = (0..<8).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
        let entries = dates.map { ScheduleEntry(date: $0, snapshot: snapshot) }
        completion(Timeline(entries: entries, policy: .after(calendar.date(byAdding: .day, value: 8, to: start)!)))
    }
}

private struct ScheduleView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ScheduleEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Text("TIMING").font(.caption).fontWeight(.bold).foregroundColor(Color(red: 0.65, green: 0.95, blue: 0.91))
                Spacer()
                if let cycle = entry.day?.cycle { Text("DAY \(cycle)").font(.caption).fontWeight(.bold) }
            }
            Text(displayDate(entry.date)).font(.headline)
            if entry.snapshot == nil {
                Text("Open Timing to load your timetable and homework.").font(.caption)
            } else {
                Text("TIMETABLE").font(.caption2).foregroundColor(Color(red: 0.65, green: 0.95, blue: 0.91))
                if let day = entry.day, !day.lessons.isEmpty {
                    ForEach(Array(day.lessons.prefix(family == .systemLarge ? 8 : family == .systemSmall ? 2 : 4))) { lesson in
                        HStack(spacing: 6) {
                            Text("P\(lesson.period)").fontWeight(.bold).frame(width: 24, alignment: .leading)
                            if family != .systemSmall { Text(lesson.time).foregroundColor(Color(red: 0.65, green: 0.95, blue: 0.91)) }
                            Text(lesson.subject).lineLimit(1)
                        }.font(.caption)
                    }
                } else {
                    Text(entry.day?.label ?? "No S6 lessons today").font(.caption).lineLimit(2)
                }
                Spacer(minLength: 0)
                Text("HOMEWORK").font(.caption2).foregroundColor(Color(red: 0.65, green: 0.95, blue: 0.91))
                if let tasks = entry.snapshot?.homework, !tasks.isEmpty {
                    ForEach(0..<min(tasks.count, family == .systemLarge ? 3 : 1), id: \.self) { index in
                        let task = tasks[index]
                        Text("\(task.subject) · \(task.title)" + (task.date.map { " · \($0)" } ?? ""))
                            .font(.caption).lineLimit(1)
                    }
                } else {
                    Text("Nothing to hand in").font(.caption)
                }
            }
        }
        .foregroundColor(.white)
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color(red: 0.12, green: 0.29, blue: 0.28))
    }
}

@main
struct TimingScheduleWidget: Widget {
    let kind = "TimingSchedule"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ScheduleProvider()) { entry in
            ScheduleView(entry: entry)
        }
        .configurationDisplayName("Timing timetable & homework")
        .description("Today's lessons and upcoming homework")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
