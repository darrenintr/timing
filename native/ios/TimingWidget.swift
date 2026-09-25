import AppIntents
import SwiftUI
import WidgetKit

// MARK: - Snapshot written by the app (src/widget-data.js)

struct Lesson: Decodable, Hashable {
    let period: Int
    let subject: String
    let time: String
    let start: String?
    let end: String?
    let room: String?
    let teacher: String?
}
struct SchoolDay: Decodable {
    let date: String
    let type: String?
    let cycle: String?
    let label: String
    let notice: String?
    let lessons: [Lesson]
}
struct Homework: Decodable {
    let id: String?
    let title: String
    let subject: String
    let date: String?
    let period: Int?
    let time: String?
    let stepsDone: Int?
    let stepsTotal: Int?
}
struct Snapshot: Decodable {
    let days: [SchoolDay]
    let homework: [Homework]
    let lastDay: String?
}

enum Store {
    static let defaults = UserDefaults(suiteName: "group.io.github.darrenintr.timing")

    static func snapshot() -> Snapshot? {
        guard let text = defaults?.string(forKey: "snapshot"), let data = text.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(Snapshot.self, from: data)
    }

    // Tick off homework from a widget: hide it now, and queue it for the app to sync.
    static func complete(_ id: String) {
        guard let defaults else { return }
        if let text = defaults.string(forKey: "snapshot"), let data = text.data(using: .utf8),
           var object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let homework = object["homework"] as? [[String: Any]] {
            object["homework"] = homework.filter { ($0["id"] as? String) != id }
            if let updated = try? JSONSerialization.data(withJSONObject: object),
               let string = String(data: updated, encoding: .utf8) {
                defaults.set(string, forKey: "snapshot")
            }
        }
        var completed = defaults.stringArray(forKey: "completed") ?? []
        if !completed.contains(id) { completed.append(id) }
        defaults.set(completed, forKey: "completed")
    }
}

struct CompleteHomeworkIntent: AppIntent {
    static var title: LocalizedStringResource = "Complete homework"
    @Parameter(title: "Homework") var id: String

    init() {}
    init(id: String) { self.id = id }

    func perform() async throws -> some IntentResult {
        Store.complete(id)
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

// MARK: - School time (always Hong Kong)

private let hongKong = TimeZone(identifier: "Asia/Hong_Kong")!
private let calendar: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = hongKong
    return calendar
}()
private func format(_ date: Date, _ pattern: String) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_GB")
    formatter.timeZone = hongKong
    formatter.dateFormat = pattern
    return formatter.string(from: date)
}
private func dateKey(_ date: Date) -> String { format(date, "yyyy-MM-dd") }
private func day(_ key: String) -> Date? {
    let parts = key.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
}
private func moment(_ key: String, _ time: String?) -> Date? {
    guard let time, let base = day(key) else { return nil }
    let parts = time.split(separator: ":").compactMap { Int($0) }
    guard parts.count == 2 else { return nil }
    return calendar.date(byAdding: .minute, value: parts[0] * 60 + parts[1], to: base)
}
private func minutes(from: Date, to: Date) -> Int { max(0, Int(ceil(to.timeIntervalSince(from) / 60))) }

struct TimedLesson: Identifiable {
    let lesson: Lesson
    let start: Date
    let end: Date
    var id: Int { lesson.period }
    var startText: String { lesson.start ?? lesson.time }
    var endText: String { lesson.end ?? "" }
    var place: String { [lesson.room, lesson.teacher].compactMap { $0?.isEmpty == false ? $0 : nil }.joined(separator: " · ") }
}

enum Phase { case noData, finished, beforeSchool, lesson, breakTime, afterSchool, special, noSchool }
enum Due { case overdue, today, upcoming, unconfirmed }

struct SchoolContext {
    let now: Date
    let snapshot: Snapshot?

    var todayKey: String { dateKey(now) }
    var today: SchoolDay? { snapshot?.days.first { $0.date == todayKey } }
    var lessons: [TimedLesson] { timed(today) }
    var current: TimedLesson? { lessons.first { $0.start <= now && now < $0.end } }
    var upcoming: [TimedLesson] { lessons.filter { $0.start > now } }
    var nextSchoolDay: SchoolDay? { snapshot?.days.first { $0.date > todayKey && !$0.lessons.isEmpty } }
    var homework: [Homework] { snapshot?.homework ?? [] }
    var cycleText: String? { today?.cycle.map { "Day \($0)" } }
    var lastEnd: String? { lessons.last?.endText }

    var phase: Phase {
        guard snapshot != nil else { return .noData }
        if todayKey > (snapshot?.lastDay ?? "2027-02-01") { return .finished }
        guard let today else { return .noSchool }
        if lessons.isEmpty { return ["exam", "special", "opening"].contains(today.type ?? "") ? .special : .noSchool }
        if current != nil { return .lesson }
        if let first = lessons.first, now < first.start { return .beforeSchool }
        if let last = lessons.last, now >= last.end { return .afterSchool }
        return .breakTime
    }

    func timed(_ day: SchoolDay?) -> [TimedLesson] {
        guard let day else { return [] }
        return day.lessons.compactMap { lesson in
            guard let start = moment(day.date, lesson.start ?? lesson.time),
                  let end = moment(day.date, lesson.end) ?? calendar.date(byAdding: .minute, value: 35, to: start) else { return nil }
            return TimedLesson(lesson: lesson, start: start, end: end)
        }
    }

    func status(_ item: Homework) -> Due {
        guard let date = item.date else { return .unconfirmed }
        if date < todayKey { return .overdue }
        return date == todayKey ? .today : .upcoming
    }

    func dueText(_ item: Homework, long: Bool = false) -> String {
        guard let date = item.date, let dueDay = day(date) else { return "date to confirm" }
        let period = item.period.map { "P\($0)" }
        switch status(item) {
        case .overdue: return long ? "overdue since \(format(dueDay, "EEE"))" : "overdue"
        case .today: return ["today", period].compactMap { $0 }.joined(separator: ", ")
        default: return [format(dueDay, "EEE"), period].compactMap { $0 }.joined(separator: " ")
        }
    }

    // Fraction of the current lesson that has passed.
    var progress: Double {
        guard let current else { return 0 }
        let total = current.end.timeIntervalSince(current.start)
        return total > 0 ? min(1, max(0, now.timeIntervalSince(current.start) / total)) : 0
    }

    // "S6 test week · exam timetable needed" → ("S6 test week", "Exam timetable needed").
    var noticeParts: (String, String?) {
        let parts = (today?.label ?? "").components(separatedBy: " · ")
        let detail = parts.dropFirst().joined(separator: " · ")
        let capitalised: String? = detail.isEmpty ? nil : detail.prefix(1).uppercased() + String(detail.dropFirst())
        return (parts.first ?? "", capitalised)
    }
}

// MARK: - Timeline: an entry at every period boundary, each minute in school hours, and midnight

struct SchoolEntry: TimelineEntry {
    let date: Date
    let snapshot: Snapshot?
    var context: SchoolContext { SchoolContext(now: date, snapshot: snapshot) }
    var relevance: TimelineEntryRelevance? {
        switch context.phase {
        case .lesson, .breakTime: return TimelineEntryRelevance(score: 1)
        case .beforeSchool:
            guard let first = context.lessons.first else { return nil }
            return TimelineEntryRelevance(score: first.start.timeIntervalSince(date) <= 600 ? 1 : 0.2)
        default: return TimelineEntryRelevance(score: 0.05)
        }
    }
}

struct SchoolProvider: TimelineProvider {
    func placeholder(in context: Context) -> SchoolEntry { SchoolEntry(date: Date(), snapshot: nil) }
    func getSnapshot(in context: Context, completion: @escaping (SchoolEntry) -> Void) {
        completion(SchoolEntry(date: Date(), snapshot: Store.snapshot()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<SchoolEntry>) -> Void) {
        let now = Date()
        let snapshot = Store.snapshot()
        let start = calendar.startOfDay(for: now)
        var dates = Set<Date>([now])
        for offset in 0..<3 {
            guard let midnight = calendar.date(byAdding: .day, value: offset, to: start) else { continue }
            if offset > 0 { dates.insert(midnight) }
            let lessons = SchoolContext(now: midnight, snapshot: snapshot).lessons
            for lesson in lessons { dates.insert(lesson.start); dates.insert(lesson.end) }
            // Minute entries keep "18 min left" and the progress bars honest today.
            if offset == 0, let first = lessons.first, let last = lessons.last,
               var tick = calendar.date(byAdding: .hour, value: -1, to: first.start) {
                while tick < last.end {
                    if tick > now { dates.insert(tick) }
                    tick = tick.addingTimeInterval(60)
                }
            }
        }
        let entries = dates.filter { $0 >= now }.sorted().map { SchoolEntry(date: $0, snapshot: snapshot) }
        let reload = calendar.date(byAdding: .day, value: 3, to: start) ?? now.addingTimeInterval(86400)
        completion(Timeline(entries: entries, policy: .after(reload)))
    }
}

// MARK: - Design tokens: paper, ink, and colour only where it means something

extension Color {
    init(light: UInt32, dark: UInt32) {
        func color(_ hex: UInt32) -> UIColor {
            UIColor(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                    blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
        }
        self.init(uiColor: UIColor { $0.userInterfaceStyle == .dark ? color(dark) : color(light) })
    }
    static let paper = Color(light: 0xFAF9F6, dark: 0x1B1E1D)
    static let ink = Color(light: 0x191C1B, dark: 0xE8EBE9)
    static let ink2 = Color(light: 0x4A504E, dark: 0xB3B9B6)
    static let ink3 = Color(light: 0x6B716F, dark: 0x9AA29F)
    static let faint = Color(light: 0x8A908E, dark: 0x7B8380)
    static let hairline = Color(light: 0xE6E4DF, dark: 0x2A2E2C)
    static let accent = Color(light: 0x1F6A64, dark: 0x7FD4C9)
    static let accentWash = Color(light: 0xDCEFEB, dark: 0x16302D)
    static let warm = Color(light: 0xB0532E, dark: 0xF0A07E)
    static let danger = Color(light: 0xB3261E, dark: 0xFFB4AB)
}

private func serif(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font { .system(size: size, weight: weight, design: .serif) }
private func mono(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font { .system(size: size, weight: weight, design: .monospaced) }
private func sans(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font { .system(size: size, weight: weight) }

private func dueColor(_ due: Due) -> Color {
    switch due {
    case .overdue: return .danger
    case .today: return .warm
    case .upcoming: return .accent
    case .unconfirmed: return .ink3
    }
}

struct Eyebrow: View {
    let text: String
    var color: Color = .ink3
    var body: some View {
        Text(text.uppercased()).font(sans(10, .heavy)).tracking(1.2).foregroundStyle(color).lineLimit(1)
    }
}

struct CycleLetter: View {
    let text: String
    var size: CGFloat = 18
    var body: some View { Text(text).font(serif(size, .semibold)).italic().foregroundStyle(Color.accent) }
}

struct Bar: View {
    let value: Double
    var track: Color = .hairline
    var fill: Color = .accent
    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(track)
                Capsule().fill(fill).frame(width: proxy.size.width * value)
            }
        }.frame(height: 3)
    }
}

struct LessonLine: View {
    let lesson: TimedLesson
    var timeWidth: CGFloat = 40
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(lesson.startText).font(mono(12, .medium)).foregroundStyle(Color.ink2).frame(width: timeWidth, alignment: .leading)
            Text(lesson.lesson.subject).font(sans(14, .semibold)).foregroundStyle(Color.ink).lineLimit(1)
            Spacer(minLength: 4)
            Text(lesson.lesson.room ?? "").font(mono(10)).foregroundStyle(Color.ink3)
        }.padding(.vertical, 6)
    }
}

struct BreakLine: View {
    let text: String
    var indent: CGFloat = 48
    var body: some View {
        HStack(spacing: 4) {
            Text("Break").font(serif(12)).italic()
            Text(text).font(mono(10))
        }.foregroundStyle(Color.ink3).padding(.leading, indent).padding(.vertical, 3)
    }
}

struct CheckButton: View {
    let item: Homework
    let color: Color
    var body: some View {
        if let id = item.id {
            Button(intent: CompleteHomeworkIntent(id: id)) {
                Circle().strokeBorder(color, lineWidth: 1.5).frame(width: 22, height: 22)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Mark \(item.subject) homework complete")
        } else {
            Circle().strokeBorder(color, lineWidth: 1.5).frame(width: 22, height: 22)
        }
    }
}

struct HomeworkRow: View {
    let item: Homework
    let context: SchoolContext
    var showTime = false
    var body: some View {
        let due = context.status(item)
        HStack(alignment: .center, spacing: 10) {
            CheckButton(item: item, color: due == .overdue ? .danger : .faint)
            Link(destination: URL(string: "timing://homework/\(item.id?.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "")")!) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(item.title).font(sans(13, .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                    HStack(spacing: 3) {
                        Text("\(item.subject) ·").foregroundStyle(Color.ink2)
                        if due == .overdue || due == .today {
                            Text(context.dueText(item)).fontWeight(.bold).foregroundStyle(dueColor(due))
                        } else {
                            Text(context.dueText(item)).foregroundStyle(Color.ink2)
                            if showTime, let time = item.time { Text(time).font(mono(10)).foregroundStyle(Color.ink2) }
                        }
                    }.font(sans(11)).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
    }
}

// MARK: - The "now" block shared by small, medium and extra large

struct NowBlock: View {
    let context: SchoolContext
    var titleSize: CGFloat = 27
    var showNext = true

    var body: some View {
        switch context.phase {
        case .lesson:
            if let current = context.current {
                VStack(alignment: .leading, spacing: 2) {
                    Eyebrow(text: "Now · \(minutes(from: context.now, to: current.end)) min", color: .accent)
                    Text(current.lesson.subject).font(serif(titleSize, .medium)).foregroundStyle(Color.ink)
                        .lineLimit(1).minimumScaleFactor(0.6)
                    Text(current.place).font(mono(11)).foregroundStyle(Color.ink3)
                    Bar(value: context.progress).padding(.top, 8)
                    if showNext {
                        Group {
                            if let next = context.upcoming.first {
                                (Text(next.startText).font(mono(11)) + Text(" · \(next.lesson.subject)"))
                            } else {
                                Text("Last lesson today")
                            }
                        }.font(sans(11)).foregroundStyle(Color.ink2).lineLimit(1).padding(.top, 6)
                    }
                }
            }
        case .beforeSchool:
            if let first = context.lessons.first {
                VStack(alignment: .leading, spacing: 2) {
                    Eyebrow(text: "First · in \(minutes(from: context.now, to: first.start)) min", color: .ink2)
                    Text(first.lesson.subject).font(serif(titleSize, .medium)).foregroundStyle(Color.ink).lineLimit(1).minimumScaleFactor(0.6)
                    Text(first.place).font(mono(11)).foregroundStyle(Color.ink3)
                    Text("\(first.startText) – \(first.endText)").font(mono(11)).foregroundStyle(Color.ink2).padding(.top, 10)
                }
            }
        case .breakTime:
            if let next = context.upcoming.first {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Break").font(serif(titleSize - 1, .light)).italic().foregroundStyle(Color.ink2)
                    Text("\(minutes(from: context.now, to: next.start)) min left").font(sans(12)).foregroundStyle(Color.ink2)
                    Rectangle().fill(Color.hairline).frame(height: 1).padding(.vertical, 8)
                    Eyebrow(text: "Then · \(next.startText)")
                    (Text(next.lesson.subject).font(sans(14, .semibold)).foregroundColor(.ink)
                        + Text(" \(next.lesson.room ?? "")").font(mono(10)).foregroundColor(.ink3)).lineLimit(1)
                }
            }
        case .afterSchool, .noSchool:
            NextSchoolDay(context: context, lead: context.phase == .afterSchool ? nil : "Back")
        case .special:
            let parts = context.noticeParts
            VStack(alignment: .leading, spacing: 6) {
                Text(parts.0).font(serif(titleSize - 4, .medium)).foregroundStyle(Color.ink).lineLimit(2).minimumScaleFactor(0.7)
                if let detail = parts.1 {
                    Text(detail).font(sans(12, .semibold)).foregroundStyle(Color.warm)
                        .padding(.leading, 10).overlay(alignment: .leading) { Rectangle().fill(Color.warm).frame(width: 2) }
                }
                Text("No ordinary lessons shown").font(sans(11)).foregroundStyle(Color.ink2)
            }
        case .finished:
            VStack(alignment: .leading, spacing: 10) {
                Text("The last school day was 1 February.").font(serif(21, .light)).italic().foregroundStyle(Color.ink2)
                Text("Homework and exports stay in the app.").font(sans(11)).foregroundStyle(Color.ink3)
            }
        case .noData:
            Text("Open Timing to load your timetable and homework.").font(sans(13)).foregroundStyle(Color.ink2)
        }
    }
}

struct NextSchoolDay: View {
    let context: SchoolContext
    var lead: String?
    var body: some View {
        if let next = context.nextSchoolDay, let date = day(next.date), let first = next.lessons.first {
            let dueFirst = context.homework.filter { $0.date == next.date && $0.period == first.period }.count
            VStack(alignment: .leading, spacing: 2) {
                Eyebrow(text: [lead, format(date, "EEEE")].compactMap { $0 }.joined(separator: " "))
                if let cycle = next.cycle { CycleLetter(text: "Day \(cycle)", size: 20) }
                (Text(first.start ?? first.time).font(mono(11, .medium)).foregroundColor(.ink2)
                    + Text(" \(first.subject)").font(sans(13, .semibold)).foregroundColor(.ink)).lineLimit(1).padding(.top, 4)
                if dueFirst > 0 {
                    Text("\(dueFirst) due first lesson").font(sans(11, .bold)).foregroundStyle(Color.warm).padding(.top, 2)
                }
            }
        } else {
            Text("No more school days published.").font(sans(12)).foregroundStyle(Color.ink2)
        }
    }
}

// MARK: - Home Screen widgets

struct SmallNowView: View {
    let context: SchoolContext
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            switch context.phase {
            case .afterSchool:
                Text("Done for today.").font(serif(22, .light)).italic().foregroundStyle(Color.ink2)
            case .noSchool:
                Eyebrow(text: "No school")
                Text(context.today?.type == "holiday" ? context.today?.label ?? "" : format(context.now, "EEEE"))
                    .font(serif(26, .medium)).foregroundStyle(Color.ink).lineLimit(2).minimumScaleFactor(0.6).padding(.top, 4)
            case .finished:
                Eyebrow(text: "S6 finished")
            default:
                HStack(alignment: .firstTextBaseline) {
                    if let cycle = context.cycleText { CycleLetter(text: cycle) }
                    Spacer()
                    Text(corner).font(mono(11)).foregroundStyle(Color.ink3)
                }
            }
            Spacer(minLength: 4)
            NowBlock(context: context)
        }
        .widgetURL(URL(string: "timing://today"))
    }

    private var corner: String {
        switch context.phase {
        case .lesson: return context.current.map { "P\($0.lesson.period)" } ?? ""
        case .beforeSchool: return "P1"
        case .breakTime: return format(context.now, "HH:mm")
        default: return format(context.now, "EEE d")
        }
    }
}

struct SmallDueView: View {
    let context: SchoolContext
    var body: some View {
        let items = context.homework
        VStack(alignment: .leading, spacing: 0) {
            Eyebrow(text: "Homework")
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("\(items.count)").font(serif(44)).foregroundStyle(Color.ink)
                Text("open").font(sans(13)).foregroundStyle(Color.ink2)
            }.padding(.top, 2)
            Spacer(minLength: 4)
            if items.isEmpty {
                Text(context.snapshot == nil ? "Open Timing to load homework." : "Nothing to hand in.")
                    .font(sans(12)).foregroundStyle(Color.ink2)
            }
            VStack(alignment: .leading, spacing: 7) {
                ForEach(Array(items.prefix(3).enumerated()), id: \.offset) { _, item in
                    let due = context.status(item)
                    HStack(spacing: 8) {
                        Circle().fill(dueColor(due)).frame(width: 7, height: 7)
                        Text(item.subject).font(sans(13, .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                        Spacer(minLength: 2)
                        switch due {
                        case .overdue: Text("Overdue").font(sans(11, .bold)).foregroundStyle(Color.danger)
                        case .today: Text("Today").font(sans(11, .bold)).foregroundStyle(Color.warm)
                        default: Text(context.dueText(item)).font(mono(11)).foregroundStyle(Color.ink3)
                        }
                    }
                }
            }
        }
        .widgetURL(URL(string: "timing://homework"))
    }
}

struct MediumTodayView: View {
    let context: SchoolContext
    var body: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 0) {
                if let cycle = context.cycleText { CycleLetter(text: cycle) }
                else { Eyebrow(text: format(context.now, "EEEE")) }
                Spacer(minLength: 4)
                switch context.phase {
                case .afterSchool:
                    Text("Done for today.").font(serif(20, .light)).italic().foregroundStyle(Color.ink2)
                case .noSchool:
                    Eyebrow(text: "No school")
                    Text(context.today?.type == "holiday" ? context.today?.label ?? "" : format(context.now, "EEEE"))
                        .font(serif(22, .medium)).foregroundStyle(Color.ink).lineLimit(2).minimumScaleFactor(0.6)
                default:
                    NowBlock(context: context, titleSize: 25, showNext: false)
                }
            }
            .frame(width: 122, alignment: .leading)
            .padding(.trailing, 16)
            .overlay(alignment: .trailing) { Rectangle().fill(Color.hairline).frame(width: 1) }

            VStack(alignment: .leading, spacing: 0) {
                let upcoming = context.upcoming
                if !upcoming.isEmpty {
                    HStack(alignment: .firstTextBaseline) {
                        Eyebrow(text: "Next")
                        Spacer()
                        if let end = context.lastEnd { Text("until \(end)").font(mono(10)).foregroundStyle(Color.ink3) }
                    }
                    LessonList(lessons: Array(upcoming.prefix(3)), previous: context.current)
                } else if let next = context.nextSchoolDay, let date = day(next.date) {
                    HStack(alignment: .firstTextBaseline) {
                        Eyebrow(text: format(date, "EEEE"))
                        Spacer()
                        if let cycle = next.cycle { Text("Day \(cycle)").font(mono(10)).foregroundStyle(Color.ink3) }
                    }
                    LessonList(lessons: Array(context.timed(next).prefix(3)), previous: nil)
                }
                Spacer(minLength: 0)
            }
        }
        .widgetURL(URL(string: "timing://today"))
    }
}

// Lessons with hairlines between them and a break row wherever there is a gap.
struct LessonList: View {
    let lessons: [TimedLesson]
    let previous: TimedLesson?
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(lessons.enumerated()), id: \.element.id) { index, lesson in
                let before: TimedLesson? = index == 0 ? previous : lessons[index - 1]
                if index > 0 { Rectangle().fill(Color.hairline).frame(height: 1) }
                if let before, before.end < lesson.start {
                    BreakLine(text: before.endText)
                    Rectangle().fill(Color.hairline).frame(height: 1)
                }
                LessonLine(lesson: lesson)
            }
        }
    }
}

// The whole day: past lessons faded, the current one in Fraunces with its bar.
struct DayLessons: View {
    let context: SchoolContext
    var showBreaks = false
    var body: some View {
        let lessons = context.lessons
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(lessons.enumerated()), id: \.element.id) { index, lesson in
                if showBreaks, index > 0, lessons[index - 1].end < lesson.start {
                    BreakLine(text: "\(lessons[index - 1].endText)–\(lesson.startText)", indent: 62)
                }
                row(lesson)
            }
        }
    }

    @ViewBuilder private func row(_ lesson: TimedLesson) -> some View {
        let isNow = context.current?.id == lesson.id
        let past = lesson.end <= context.now
        if isNow && !showBreaks {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(lesson.startText).font(mono(11, .bold)).foregroundStyle(Color.accent).frame(width: 42, alignment: .leading)
                VStack(alignment: .leading, spacing: 5) {
                    Text(lesson.lesson.subject).font(serif(19, .medium)).foregroundStyle(Color.ink).lineLimit(1)
                    Bar(value: context.progress)
                }
                Text(lesson.lesson.room ?? "").font(mono(10)).foregroundStyle(Color.ink3)
            }
            .padding(.vertical, 7)
            .overlay(alignment: .top) { Rectangle().fill(Color.hairline).frame(height: 1) }
            .overlay(alignment: .bottom) { Rectangle().fill(Color.hairline).frame(height: 1) }
            .padding(.vertical, 3)
        } else {
            HStack(alignment: .firstTextBaseline, spacing: showBreaks ? 10 : 8) {
                Text(lesson.startText).font(mono(11, isNow ? .bold : .regular))
                    .foregroundStyle(isNow ? Color.accent : past ? Color.faint : Color.ink2)
                    .frame(width: showBreaks ? 44 : 42, alignment: .leading)
                Text(lesson.lesson.subject).font(sans(13, isNow ? .bold : past ? .regular : .semibold))
                    .foregroundStyle(past ? Color.faint : Color.ink).lineLimit(1)
                Spacer(minLength: 4)
                Text(showBreaks ? lesson.place : lesson.lesson.room ?? "").font(mono(10))
                    .foregroundStyle(isNow ? Color.accent : past ? Color.faint : Color.ink3).lineLimit(1)
            }
            .padding(.vertical, isNow ? 6 : 3)
            .padding(.horizontal, showBreaks ? 8 : 0)
            .background(isNow ? RoundedRectangle(cornerRadius: 10).fill(Color.accentWash) : nil)
        }
    }
}

struct DayHeader: View {
    let context: SchoolContext
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(format(context.now, "EEEE")).font(serif(30, .light)).foregroundStyle(Color.ink)
                Spacer()
                if let cycle = context.cycleText { CycleLetter(text: cycle, size: 20) }
            }
            Text(summary).font(mono(11)).foregroundStyle(Color.ink3).padding(.top, 5).padding(.bottom, 6)
        }
    }
    private var summary: String {
        let count = context.lessons.count
        if count == 0 { return context.today?.label ?? "No lessons" }
        return "\(count) lessons · until \(context.lastEnd ?? "")"
    }
}

struct LargeDayView: View {
    let context: SchoolContext
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            DayHeader(context: context)
            if context.lessons.isEmpty {
                NowBlock(context: context, titleSize: 26).padding(.top, 8)
            } else {
                DayLessons(context: context)
                if let notice = context.today?.notice {
                    Text(notice).font(sans(11, .semibold)).foregroundStyle(Color.warm).padding(.top, 6)
                }
            }
            Spacer(minLength: 6)
            let items = context.homework
            let overdue = items.filter { context.status($0) == .overdue }.count
            let shown = (items.filter { context.status($0) != .overdue } + items.filter { context.status($0) == .overdue })
            HStack(alignment: .firstTextBaseline) {
                Eyebrow(text: "Homework")
                Spacer()
                if overdue > 0 { Eyebrow(text: "\(overdue) overdue", color: .danger) }
            }
            .padding(.top, 8)
            .overlay(alignment: .top) { Rectangle().fill(Color.hairline).frame(height: 1) }
            if items.isEmpty {
                Text("Nothing to hand in.").font(sans(12)).foregroundStyle(Color.ink2).padding(.top, 6)
            }
            VStack(spacing: 4) {
                ForEach(Array(shown.prefix(context.lessons.isEmpty ? 4 : 2).enumerated()), id: \.offset) { _, item in
                    HomeworkRow(item: item, context: context, showTime: true)
                }
            }.padding(.top, 4)
        }
        .widgetURL(URL(string: "timing://today"))
    }
}

struct ExtraLargeView: View {
    let context: SchoolContext
    var body: some View {
        HStack(alignment: .top, spacing: 24) {
            VStack(alignment: .leading, spacing: 0) {
                Text(format(context.now, "EEEE")).font(serif(42, .light)).foregroundStyle(Color.ink)
                Text(format(context.now, "d MMMM yyyy")).font(sans(13)).foregroundStyle(Color.ink2).padding(.top, 6)
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    if let cycle = context.cycleText { CycleLetter(text: cycle, size: 24) }
                    if let end = context.lastEnd {
                        (Text("\(context.lessons.count) lessons · until ") + Text(end).font(mono(12)))
                            .font(sans(12)).foregroundStyle(Color.ink3)
                    }
                }.padding(.top, 12)
                Spacer(minLength: 8)
                if context.phase == .lesson, let current = context.current {
                    Eyebrow(text: "Now · \(minutes(from: context.now, to: current.end)) min left", color: .accent)
                    Text(current.lesson.subject).font(serif(36, .medium)).foregroundStyle(Color.ink)
                        .lineLimit(1).minimumScaleFactor(0.6).padding(.top, 4)
                    Text([current.place, "P\(current.lesson.period)"].filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(mono(12)).foregroundStyle(Color.ink3).padding(.top, 4)
                    Bar(value: context.progress).padding(.top, 12)
                    if let next = context.upcoming.first {
                        let then: String = next.lesson.subject == current.lesson.subject
                            ? "Then \(next.lesson.subject) again at " : "Then \(next.lesson.subject) at "
                        (Text(then) + Text(next.startText).font(mono(12)))
                            .font(sans(12)).foregroundStyle(Color.ink2).padding(.top, 10)
                    }
                } else {
                    NowBlock(context: context, titleSize: 32)
                }
            }
            .frame(width: 212, alignment: .leading)
            .padding(.trailing, 24)
            .overlay(alignment: .trailing) { Rectangle().fill(Color.hairline).frame(width: 1) }

            VStack(alignment: .leading, spacing: 0) {
                if context.lessons.isEmpty {
                    Eyebrow(text: context.today?.label ?? "No lessons").padding(.bottom, 6)
                    NextSchoolDay(context: context, lead: "Next")
                } else {
                    Eyebrow(text: "Lessons").padding(.bottom, 6)
                    DayLessons(context: context, showBreaks: true)
                }
                Spacer(minLength: 0)
            }

            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    Eyebrow(text: "Homework")
                    Spacer()
                    Text("\(context.homework.count)").font(serif(20, .medium)).foregroundStyle(Color.ink)
                }.padding(.bottom, 4)
                ForEach(Array(context.homework.prefix(4).enumerated()), id: \.offset) { index, item in
                    HomeworkRow(item: item, context: context)
                        .padding(.vertical, 10)
                        .overlay(alignment: .bottom) {
                            if index < min(4, context.homework.count) - 1 { Rectangle().fill(Color.hairline).frame(height: 1) }
                        }
                }
                Spacer(minLength: 0)
                Link(destination: URL(string: "timing://homework/new")!) {
                    Text("+ Add homework").font(sans(12, .semibold)).foregroundStyle(Color.accent)
                }
            }
            .frame(width: 188, alignment: .leading)
            .padding(.leading, 24)
            .overlay(alignment: .leading) { Rectangle().fill(Color.hairline).frame(width: 1) }
        }
        .widgetURL(URL(string: "timing://today"))
    }
}

// MARK: - Lock Screen: rendered vibrant, white at three opacities

struct CircularNowView: View {
    let context: SchoolContext
    var body: some View {
        let letter = context.today?.cycle ?? "–"
        if let current = context.current {
            Gauge(value: context.progress) {
                EmptyView()
            } currentValueLabel: {
                VStack(spacing: 0) {
                    Text(letter).font(serif(22, .semibold)).italic()
                    Text("P\(current.lesson.period)").font(mono(9)).opacity(0.75)
                }
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .widgetAccentable()
        } else {
            ZStack {
                AccessoryWidgetBackground()
                Text(letter).font(serif(26, .semibold)).italic()
            }
        }
    }
}

struct CircularDueView: View {
    let context: SchoolContext
    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 1) {
                Text("\(context.homework.count)").font(serif(24, .medium))
                Text("DUE").font(sans(9, .heavy)).tracking(0.9).opacity(0.75)
            }
        }
    }
}

struct RectangularNowView: View {
    let context: SchoolContext
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            if let current = context.current {
                Text("NOW · \(minutes(from: context.now, to: current.end)) MIN").font(sans(10, .heavy)).tracking(1).opacity(0.75)
                Text(current.lesson.subject).font(serif(17, .medium)).lineLimit(1).widgetAccentable()
                Bar(value: context.progress, track: .white.opacity(0.25), fill: .white).padding(.vertical, 3)
                if let next = context.upcoming.first {
                    (Text("Next ") + Text(next.startText).font(mono(11)) + Text(" · \(next.lesson.room ?? next.lesson.subject)"))
                        .font(sans(11)).opacity(0.8).lineLimit(1)
                }
            } else if context.phase == .beforeSchool || context.phase == .breakTime, let next = context.upcoming.first {
                Text(context.phase == .breakTime ? "BREAK · NEXT \(next.startText)" : "FIRST · \(next.startText)")
                    .font(sans(10, .heavy)).tracking(1).opacity(0.75)
                Text(next.lesson.subject).font(serif(17, .medium)).lineLimit(1).widgetAccentable()
                Text(next.place).font(mono(11)).opacity(0.8)
            } else if let next = context.nextSchoolDay, let date = day(next.date) {
                Text(format(date, "EEEE").uppercased()).font(sans(10, .heavy)).tracking(1).opacity(0.75)
                Text(next.cycle.map { "Day \($0)" } ?? "School").font(serif(17, .semibold)).italic().widgetAccentable()
                if let first = next.lessons.first {
                    Text("\(first.start ?? first.time) \(first.subject)").font(sans(11)).opacity(0.8).lineLimit(1)
                }
            } else {
                Text("Timing").font(serif(17, .medium))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct InlineNowView: View {
    let context: SchoolContext
    var body: some View {
        let cycle = context.cycleText
        if let current = context.current {
            Text([cycle, "\(current.lesson.subject) until \(current.endText)"].compactMap { $0 }.joined(separator: " · "))
        } else if let next = context.upcoming.first {
            Text([cycle, "\(next.lesson.subject) at \(next.startText)"].compactMap { $0 }.joined(separator: " · "))
        } else if let cycle {
            Text("\(cycle) · done for today")
        } else {
            Text(context.today?.label ?? "Timing")
        }
    }
}

// MARK: - Widgets

struct NowEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SchoolEntry
    var body: some View {
        let context = entry.context
        Group {
            switch family {
            case .accessoryCircular: CircularNowView(context: context)
            case .accessoryRectangular: RectangularNowView(context: context)
            case .accessoryInline: InlineNowView(context: context)
            default: SmallNowView(context: context)
            }
        }
        .containerBackground(for: .widget) { family == .systemSmall ? Color.paper : Color.clear }
    }
}

struct DueEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SchoolEntry
    var body: some View {
        Group {
            if family == .accessoryCircular { CircularDueView(context: entry.context) }
            else { SmallDueView(context: entry.context) }
        }
        .containerBackground(for: .widget) { family == .systemSmall ? Color.paper : Color.clear }
    }
}

struct ScheduleEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SchoolEntry
    var body: some View {
        Group {
            switch family {
            case .systemExtraLarge: ExtraLargeView(context: entry.context)
            case .systemLarge: LargeDayView(context: entry.context)
            default: MediumTodayView(context: entry.context)
            }
        }
        .containerBackground(for: .widget) { Color.paper }
    }
}

struct TimingNowWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TimingNow", provider: SchoolProvider()) { NowEntryView(entry: $0) }
            .configurationDisplayName("Now")
            .description("The cycle day, the lesson happening now and what comes next.")
            .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct TimingDueWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TimingDue", provider: SchoolProvider()) { DueEntryView(entry: $0) }
            .configurationDisplayName("Due next")
            .description("Open homework, with what is overdue or due today first.")
            .supportedFamilies([.systemSmall, .accessoryCircular])
    }
}

struct TimingScheduleWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TimingSchedule", provider: SchoolProvider()) { ScheduleEntryView(entry: $0) }
            .configurationDisplayName("Today")
            .description("Now, the rest of the day and homework you can tick off.")
            .supportedFamilies([.systemMedium, .systemLarge, .systemExtraLarge])
    }
}

@main
struct TimingWidgets: WidgetBundle {
    var body: some Widget {
        TimingNowWidget()
        TimingDueWidget()
        TimingScheduleWidget()
    }
}
