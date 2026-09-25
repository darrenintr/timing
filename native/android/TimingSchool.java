package io.github.darrenintr.timing;

import android.content.Context;
import android.content.SharedPreferences;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

/** The app's widget snapshot (src/widget-data.js), read at one moment in Hong Kong school time. */
final class TimingSchool {
    static final TimeZone ZONE = TimeZone.getTimeZone("Asia/Hong_Kong");
    private static final String PREFS = "timing-widget";

    enum Phase { NO_DATA, FINISHED, BEFORE_SCHOOL, LESSON, BREAK, AFTER_SCHOOL, SPECIAL, NO_SCHOOL }
    enum Due { OVERDUE, TODAY, UPCOMING, UNCONFIRMED }

    static final class Lesson {
        int period; String subject, room, teacher, start, end; long startMs, endMs;
        String place() {
            if (room.isEmpty()) return teacher;
            return teacher.isEmpty() ? room : room + " · " + teacher;
        }
    }
    static final class Day {
        String date, type, cycle, label, notice;
        final List<Lesson> lessons = new ArrayList<>();
    }
    static final class Task {
        String id, title, subject, date, time; int period, stepsDone, stepsTotal;
    }

    final long now;
    final String today;
    final boolean loaded;
    final String lastDay;
    final List<Day> days = new ArrayList<>();
    final List<Task> homework = new ArrayList<>();
    final Day day;

    private TimingSchool(String json, long now) {
        this.now = now;
        this.today = key(now);
        boolean ok = false;
        String last = "2027-02-01";
        try {
            JSONObject snapshot = new JSONObject(json);
            last = snapshot.optString("lastDay", last);
            JSONArray rows = snapshot.optJSONArray("days");
            if (rows != null) {
                ok = true;
                for (int i = 0; i < rows.length(); i++) {
                    JSONObject row = rows.optJSONObject(i);
                    if (row != null) days.add(readDay(row));
                }
            }
            JSONArray tasks = snapshot.optJSONArray("homework");
            if (tasks != null) {
                for (int i = 0; i < tasks.length(); i++) {
                    JSONObject row = tasks.optJSONObject(i);
                    if (row == null) continue;
                    Task task = new Task();
                    task.id = text(row, "id");
                    task.title = text(row, "title");
                    task.subject = text(row, "subject");
                    task.date = text(row, "date");
                    task.time = text(row, "time");
                    task.period = row.optInt("period", 0);
                    task.stepsDone = row.optInt("stepsDone", 0);
                    task.stepsTotal = row.optInt("stepsTotal", 0);
                    homework.add(task);
                }
            }
        } catch (Exception ignored) { /* Corrupt data reads as "open Timing". */ }
        loaded = ok;
        lastDay = last;
        Day found = null;
        for (Day candidate : days) if (candidate.date.equals(today)) { found = candidate; break; }
        day = found;
    }

    static TimingSchool load(Context context, long now) {
        return new TimingSchool(prefs(context).getString("data", "{}"), now);
    }

    private static SharedPreferences prefs(Context context) { return context.getSharedPreferences(PREFS, 0); }

    static void store(Context context, String data) { prefs(context).edit().putString("data", data).apply(); }

    /** Tick off homework from a widget: hide it now, and queue it for the app to sync. */
    static synchronized void complete(Context context, String id) {
        SharedPreferences prefs = prefs(context);
        SharedPreferences.Editor editor = prefs.edit();
        try {
            JSONObject snapshot = new JSONObject(prefs.getString("data", "{}"));
            JSONArray tasks = snapshot.optJSONArray("homework");
            if (tasks != null) {
                JSONArray kept = new JSONArray();
                for (int i = 0; i < tasks.length(); i++) {
                    JSONObject task = tasks.optJSONObject(i);
                    if (task != null && !id.equals(task.optString("id"))) kept.put(task);
                }
                snapshot.put("homework", kept);
                editor.putString("data", snapshot.toString());
            }
            JSONArray completed = new JSONArray(prefs.getString("completed", "[]"));
            boolean seen = false;
            for (int i = 0; i < completed.length(); i++) seen |= id.equals(completed.optString(i));
            if (!seen) completed.put(id);
            editor.putString("completed", completed.toString());
        } catch (Exception ignored) { /* Leave the snapshot as it was. */ }
        editor.commit();
    }

    /** Homework ticked off on a widget, handed to the app once. */
    static synchronized JSONArray takeCompleted(Context context) {
        SharedPreferences prefs = prefs(context);
        JSONArray ids;
        try { ids = new JSONArray(prefs.getString("completed", "[]")); } catch (Exception error) { ids = new JSONArray(); }
        prefs.edit().remove("completed").commit();
        return ids;
    }

    private static String text(JSONObject row, String name) {
        return row.isNull(name) ? "" : row.optString(name, "");
    }

    private static Day readDay(JSONObject row) {
        Day day = new Day();
        day.date = text(row, "date");
        day.type = text(row, "type");
        day.cycle = text(row, "cycle");
        day.label = text(row, "label");
        day.notice = text(row, "notice");
        JSONArray lessons = row.optJSONArray("lessons");
        for (int i = 0; lessons != null && i < lessons.length(); i++) {
            JSONObject item = lessons.optJSONObject(i);
            if (item == null) continue;
            Lesson lesson = new Lesson();
            lesson.period = item.optInt("period");
            lesson.subject = text(item, "subject");
            lesson.room = text(item, "room");
            lesson.teacher = text(item, "teacher");
            lesson.start = text(item, "start");
            if (lesson.start.isEmpty()) lesson.start = text(item, "time");
            lesson.end = text(item, "end");
            lesson.startMs = at(day.date, lesson.start);
            lesson.endMs = lesson.end.isEmpty() ? lesson.startMs + 35 * 60000L : at(day.date, lesson.end);
            if (lesson.startMs > 0) day.lessons.add(lesson);
        }
        return day;
    }

    // ---- Time ----

    static Calendar calendar() {
        Calendar calendar = Calendar.getInstance(ZONE, Locale.UK);
        calendar.clear();
        return calendar;
    }

    static String format(long time, String pattern) {
        SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.UK);
        format.setTimeZone(ZONE);
        return format.format(new Date(time));
    }

    static String key(long time) { return format(time, "yyyy-MM-dd"); }

    static long dateMs(String date) { return at(date, "00:00"); }

    static long at(String date, String time) {
        try {
            String[] d = date.split("-"), t = time.split(":");
            Calendar calendar = calendar();
            calendar.set(Integer.parseInt(d[0]), Integer.parseInt(d[1]) - 1, Integer.parseInt(d[2]),
                Integer.parseInt(t[0]), Integer.parseInt(t[1]), 0);
            return calendar.getTimeInMillis();
        } catch (Exception error) {
            return 0;
        }
    }

    static int minutesUntil(long from, long to) { return (int) Math.max(0, (to - from + 59999) / 60000); }

    // ---- Where in the day are we? ----

    List<Lesson> lessons() { return day == null ? new ArrayList<>() : day.lessons; }

    Lesson current() {
        for (Lesson lesson : lessons()) if (lesson.startMs <= now && now < lesson.endMs) return lesson;
        return null;
    }

    List<Lesson> upcoming() {
        List<Lesson> list = new ArrayList<>();
        for (Lesson lesson : lessons()) if (lesson.startMs > now) list.add(lesson);
        return list;
    }

    Lesson next() {
        List<Lesson> list = upcoming();
        return list.isEmpty() ? null : list.get(0);
    }

    Day nextSchoolDay() {
        for (Day candidate : days) if (candidate.date.compareTo(today) > 0 && !candidate.lessons.isEmpty()) return candidate;
        return null;
    }

    Phase phase() {
        if (!loaded) return Phase.NO_DATA;
        if (today.compareTo(lastDay) > 0) return Phase.FINISHED;
        List<Lesson> lessons = lessons();
        if (day == null) return Phase.NO_SCHOOL;
        if (lessons.isEmpty()) {
            return "exam".equals(day.type) || "special".equals(day.type) || "opening".equals(day.type) ? Phase.SPECIAL : Phase.NO_SCHOOL;
        }
        if (current() != null) return Phase.LESSON;
        if (now < lessons.get(0).startMs) return Phase.BEFORE_SCHOOL;
        if (now >= lessons.get(lessons.size() - 1).endMs) return Phase.AFTER_SCHOOL;
        return Phase.BREAK;
    }

    float progress() {
        Lesson lesson = current();
        if (lesson == null || lesson.endMs <= lesson.startMs) return 0;
        return Math.min(1f, Math.max(0f, (now - lesson.startMs) / (float) (lesson.endMs - lesson.startMs)));
    }

    String cycle() { return day == null || day.cycle.isEmpty() ? null : day.cycle; }

    String lastEnd() {
        List<Lesson> lessons = lessons();
        return lessons.isEmpty() ? "" : lessons.get(lessons.size() - 1).end;
    }

    /** When the widget next needs redrawing: each minute in school hours, else the next boundary or midnight. */
    long nextRefresh() {
        long midnight = dateMs(key(now)) + 24 * 3600000L + 1000;
        long next = midnight;
        for (Lesson lesson : lessons()) {
            if (lesson.startMs > now) next = Math.min(next, lesson.startMs);
            if (lesson.endMs > now) next = Math.min(next, lesson.endMs);
        }
        List<Lesson> lessons = lessons();
        if (!lessons.isEmpty() && now >= lessons.get(0).startMs - 3600000L && now < lessons.get(lessons.size() - 1).endMs) {
            next = Math.min(next, (now / 60000 + 1) * 60000);
        }
        return next;
    }

    // ---- Homework ----

    Due status(Task task) {
        if (task.date.isEmpty()) return Due.UNCONFIRMED;
        int order = task.date.compareTo(today);
        return order < 0 ? Due.OVERDUE : order == 0 ? Due.TODAY : Due.UPCOMING;
    }

    int count(Due due) {
        int total = 0;
        for (Task task : homework) if (status(task) == due) total++;
        return total;
    }

    String dueText(Task task, boolean withTime) {
        String period = task.period > 0 ? "P" + task.period : "";
        switch (status(task)) {
            case OVERDUE: return "overdue since " + format(dateMs(task.date), "EEE");
            case TODAY: return period.isEmpty() ? "today" : "today, " + period;
            case UNCONFIRMED: return "date to confirm";
            default:
                String text = format(dateMs(task.date), "EEE") + (period.isEmpty() ? "" : " " + period);
                return withTime && !task.time.isEmpty() ? text + " " + task.time : text;
        }
    }

    /** "S6 test week · exam timetable needed" → {"S6 test week", "Exam timetable needed"}. */
    String[] noticeParts() {
        String label = day == null ? "" : day.label;
        int split = label.indexOf(" · ");
        if (split < 0) return new String[] {label, ""};
        String detail = label.substring(split + 3);
        return new String[] {label.substring(0, split), detail.isEmpty() ? "" : detail.substring(0, 1).toUpperCase(Locale.UK) + detail.substring(1)};
    }
}
