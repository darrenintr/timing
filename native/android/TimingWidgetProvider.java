package io.github.darrenintr.timing;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.style.StyleSpan;
import android.view.View;
import android.widget.RemoteViews;
import java.util.ArrayList;
import java.util.List;

/**
 * Timing's home screen widgets. This class is the resizable Today · Day widget (4×2 → 4×4);
 * the nested classes are the other members of the family. All of them draw from one snapshot
 * and refresh together at every period boundary.
 */
public class TimingWidgetProvider extends AppWidgetProvider {
    static final int DAY = 0, NOW = 1, DUE = 2, NEXT = 3, TIMELINE = 4, HOMEWORK = 5, NEXT_DAY = 6;
    static final String ACTION_COMPLETE = "io.github.darrenintr.timing.widget.COMPLETE";
    static final String ACTION_REFRESH = "io.github.darrenintr.timing.widget.REFRESH";
    static final String EXTRA_ID = "homework";

    public static class Now extends TimingWidgetProvider { @Override int kind() { return NOW; } }
    public static class Due extends TimingWidgetProvider { @Override int kind() { return DUE; } }
    public static class Next extends TimingWidgetProvider { @Override int kind() { return NEXT; } }
    public static class Timeline extends TimingWidgetProvider { @Override int kind() { return TIMELINE; } }
    public static class Homework extends TimingWidgetProvider { @Override int kind() { return HOMEWORK; } }
    public static class NextDay extends TimingWidgetProvider { @Override int kind() { return NEXT_DAY; } }

    private static final Class<?>[] PROVIDERS = {
        TimingWidgetProvider.class, Now.class, Due.class, Next.class, Timeline.class, Homework.class, NextDay.class
    };
    private static final int[] KINDS = {DAY, NOW, DUE, NEXT, TIMELINE, HOMEWORK, NEXT_DAY};

    int kind() { return DAY; }

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        TimingSchool school = TimingSchool.load(context, System.currentTimeMillis());
        boolean placed = false;
        for (int i = 0; i < PROVIDERS.length; i++) {
            for (int id : manager.getAppWidgetIds(new ComponentName(context, PROVIDERS[i]))) {
                manager.updateAppWidget(id, render(context, manager, school, KINDS[i], id));
                placed = true;
            }
        }
        schedule(context, school, placed);
    }

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) { updateAll(context); }

    @Override public void onDisabled(Context context) { updateAll(context); }

    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        TimingSchool school = TimingSchool.load(context, System.currentTimeMillis());
        manager.updateAppWidget(id, render(context, manager, school, kind(), id));
    }

    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (ACTION_COMPLETE.equals(action)) {
            String id = intent.getStringExtra(EXTRA_ID);
            if (id != null && !id.isEmpty()) TimingSchool.complete(context, id);
            updateAll(context);
        } else if (ACTION_REFRESH.equals(action) || Intent.ACTION_DATE_CHANGED.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action) || Intent.ACTION_TIMEZONE_CHANGED.equals(action)) {
            updateAll(context);
        }
    }

    /** Redraw at the next period boundary (and each minute in school hours) while any widget is placed. */
    private static void schedule(Context context, TimingSchool school, boolean placed) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        Intent intent = new Intent(context, TimingWidgetProvider.class).setAction(ACTION_REFRESH);
        PendingIntent refresh = PendingIntent.getBroadcast(context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (placed) alarms.set(AlarmManager.RTC, school.nextRefresh(), refresh);
        else alarms.cancel(refresh);
    }

    // ---- Shared pieces ----

    private static int color(Context context, int id) { return context.getColor(id); }

    private static PendingIntent open(Context context, String link) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(link), context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, link.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent complete(Context context, String id) {
        Intent intent = new Intent(context, TimingWidgetProvider.class).setAction(ACTION_COMPLETE)
            .setData(Uri.parse("timing://complete/" + Uri.encode(id))).putExtra(EXTRA_ID, id);
        return PendingIntent.getBroadcast(context, id.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void text(RemoteViews views, int id, CharSequence value) {
        views.setTextViewText(id, value == null ? "" : value);
        views.setViewVisibility(id, value == null || value.length() == 0 ? View.GONE : View.VISIBLE);
    }

    private static String weekday(long time) { return TimingSchool.format(time, "EEEE"); }

    private static void cookie(Context context, RemoteViews views, String cycle, int sizeDp, float textDp) {
        if (cycle == null) { views.setViewVisibility(R.id.timing_badge, View.GONE); return; }
        views.setViewVisibility(R.id.timing_badge, View.VISIBLE);
        views.setImageViewBitmap(R.id.timing_badge, TimingArt.badge(context, sizeDp, TimingArt.COOKIE_LOBES,
            TimingArt.COOKIE_DEPTH, color(context, R.color.timing_accent), cycle, color(context, R.color.timing_on_accent), true, textDp));
        views.setContentDescription(R.id.timing_badge, "Day " + cycle);
    }

    private static int widthDp(AppWidgetManager manager, int id, int fallback) {
        int width = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH);
        return width > 0 ? width : fallback;
    }

    private static int heightDp(AppWidgetManager manager, int id, int fallback) {
        int height = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT);
        return height > 0 ? height : fallback;
    }

    private static RemoteViews render(Context context, AppWidgetManager manager, TimingSchool school, int kind, int id) {
        switch (kind) {
            case NOW: return now(context, school, widthDp(manager, id, 186));
            case DUE: return due(context, school);
            case NEXT: return next(context, school);
            case TIMELINE: return timeline(context, school);
            case HOMEWORK: return homework(context, school, heightDp(manager, id, 316));
            case NEXT_DAY: return nextDay(context, school);
            default: return day(context, school, heightDp(manager, id, 186));
        }
    }

    // ---- Now · 2×2 and the left half of Today · 4×2 ----

    private static void nowBlock(Context context, RemoteViews views, TimingSchool school, int waveDp) {
        TimingSchool.Lesson current = school.current(), next = school.next();
        TimingSchool.Day nextDay = school.nextSchoolDay();
        int accent = color(context, R.color.timing_accent), quiet = color(context, R.color.timing_ink2);
        String eyebrow, title, detail, foot = null;
        int eyebrowColor = quiet, footColor = quiet;
        boolean wave = false;
        switch (school.phase()) {
            case LESSON:
                eyebrow = "Now · " + TimingSchool.minutesUntil(school.now, current.endMs) + " min";
                eyebrowColor = accent;
                title = current.subject;
                detail = current.place();
                wave = true;
                break;
            case BEFORE_SCHOOL:
                eyebrow = "First · in " + TimingSchool.minutesUntil(school.now, next.startMs) + " min";
                title = next.subject;
                detail = next.place();
                foot = next.start + " – " + next.end;
                break;
            case BREAK:
                eyebrow = "Break · " + TimingSchool.minutesUntil(school.now, next.startMs) + " min left";
                title = next.subject;
                detail = next.start + " · " + next.place();
                break;
            case AFTER_SCHOOL:
            case NO_SCHOOL:
                boolean after = school.phase() == TimingSchool.Phase.AFTER_SCHOOL;
                if (nextDay == null) {
                    eyebrow = after ? "Done for today" : "No school";
                    title = after ? "No more lessons" : school.day == null ? weekday(school.now) : school.day.label;
                    detail = "";
                    break;
                }
                TimingSchool.Lesson first = nextDay.lessons.get(0);
                String back = weekday(TimingSchool.dateMs(nextDay.date)) + (nextDay.cycle.isEmpty() ? "" : " · Day " + nextDay.cycle);
                eyebrow = after ? "Done · " + back : "No school";
                eyebrowColor = after ? quiet : color(context, R.color.timing_ink3);
                title = after ? first.subject : "holiday".equals(school.day == null ? "" : school.day.type) ? school.day.label : weekday(school.now);
                detail = after ? first.start + " · " + first.place() : "";
                if (!after) foot = "Back " + back + " · " + first.start + " " + first.subject;
                int dueFirst = 0;
                for (TimingSchool.Task task : school.homework) if (task.date.equals(nextDay.date) && task.period == first.period) dueFirst++;
                if (after && dueFirst > 0) { foot = dueFirst + " due first lesson"; footColor = color(context, R.color.timing_warm); }
                break;
            case SPECIAL:
                String[] parts = school.noticeParts();
                eyebrow = school.day.cycle.isEmpty() ? "Special day" : "Day " + school.day.cycle;
                title = parts[0];
                detail = "No ordinary lessons shown";
                foot = parts[1];
                footColor = color(context, R.color.timing_warm);
                break;
            case FINISHED:
                eyebrow = "S6 finished";
                title = "Last day was 1 Feb";
                detail = "";
                foot = "Homework and exports stay in the app.";
                break;
            default:
                eyebrow = "Timing";
                title = "Open Timing";
                detail = "";
                foot = "Open the app to load your timetable.";
        }
        text(views, R.id.timing_eyebrow, eyebrow);
        views.setTextColor(R.id.timing_eyebrow, eyebrowColor);
        text(views, R.id.timing_title, title);
        text(views, R.id.timing_detail, detail);
        if (wave) {
            views.setViewVisibility(R.id.timing_wave, View.VISIBLE);
            views.setImageViewBitmap(R.id.timing_wave, TimingArt.wave(context, waveDp, school.progress(), accent,
                color(context, R.color.timing_accent_wash)));
        } else {
            views.setViewVisibility(R.id.timing_wave, View.GONE);
        }
        if (foot != null) {
            text(views, R.id.timing_foot, foot);
            views.setTextColor(R.id.timing_foot, footColor);
        }
    }

    private static RemoteViews now(Context context, TimingSchool school, int widthDp) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.timing_widget_now);
        cookie(context, views, school.cycle(), 46, 22);
        TimingSchool.Lesson current = school.current(), next = school.next();
        String corner;
        switch (school.phase()) {
            case LESSON: corner = "P" + current.period + " · " + current.start; break;
            case BEFORE_SCHOOL: corner = "P" + next.period + " · " + next.start; break;
            case BREAK: corner = TimingSchool.format(school.now, "HH:mm"); break;
            default: corner = TimingSchool.format(school.now, "EEE d MMM");
        }
        text(views, R.id.timing_corner, corner);
        views.setViewVisibility(R.id.timing_foot, View.GONE);
        nowBlock(context, views, school, Math.max(80, widthDp - 32));
        views.setOnClickPendingIntent(R.id.timing_root, open(context, "timing://today"));
        return views;
    }

    // ---- Due · 2×1 ----

    private static RemoteViews due(Context context, TimingSchool school) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.timing_widget_due);
        int open = school.homework.size();
        views.setImageViewBitmap(R.id.timing_badge, TimingArt.badge(context, 58, TimingArt.BURST_LOBES, TimingArt.BURST_DEPTH,
            color(context, R.color.timing_warm_wash), String.valueOf(open), color(context, R.color.timing_warm_deep), false, 26));
        views.setContentDescription(R.id.timing_badge, open + " open");
        int overdue = school.count(TimingSchool.Due.OVERDUE), today = school.count(TimingSchool.Due.TODAY);
        String detail;
        int tint;
        if (!school.loaded) { detail = "Open Timing"; tint = R.color.timing_ink2; }
        else if (overdue > 0) { detail = overdue + " overdue"; tint = R.color.timing_danger; }
        else if (today > 0) { detail = today + " due today"; tint = R.color.timing_warm; }
        else if (open > 0) { detail = "Next " + school.dueText(school.homework.get(0), false); tint = R.color.timing_ink2; }
        else { detail = "All done"; tint = R.color.timing_ink2; }
        text(views, R.id.timing_detail, detail);
        views.setTextColor(R.id.timing_detail, color(context, tint));
        views.setOnClickPendingIntent(R.id.timing_root, open(context, "timing://homework"));
        return views;
    }

    // ---- Next · 2×1 ----

    private static RemoteViews next(Context context, TimingSchool school) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.timing_widget_next);
        TimingSchool.Lesson lesson = school.next();
        String eyebrow;
        if (lesson != null) {
            eyebrow = (school.phase() == TimingSchool.Phase.BEFORE_SCHOOL ? "First · " : "Next · ") + lesson.start;
        } else {
            TimingSchool.Day day = school.nextSchoolDay();
            lesson = day == null ? null : day.lessons.get(0);
            eyebrow = day == null ? "Next" : TimingSchool.format(TimingSchool.dateMs(day.date), "EEE") + " · " + lesson.start;
        }
        text(views, R.id.timing_eyebrow, eyebrow);
        text(views, R.id.timing_title, lesson == null ? (school.loaded ? "No lessons ahead" : "Open Timing") : lesson.subject);
        text(views, R.id.timing_detail, lesson == null ? "" : lesson.place());
        views.setOnClickPendingIntent(R.id.timing_root, open(context, "timing://today"));
        return views;
    }

    // ---- Today · 4×2 → Day · 4×4 ----

    private static RemoteViews lessonRow(Context context, int layout, TimingSchool.Lesson lesson, String place) {
        RemoteViews row = new RemoteViews(context.getPackageName(), layout);
        row.setTextViewText(R.id.timing_row_time, lesson.start);
        row.setTextViewText(R.id.timing_row_subject, lesson.subject);
        row.setTextViewText(R.id.timing_row_place, place);
        return row;
    }

    private static RemoteViews line(Context context) { return new RemoteViews(context.getPackageName(), R.layout.timing_row_line); }

    private static RemoteViews day(Context context, TimingSchool school, int heightDp) {
        return heightDp < 250 ? today(context, school) : wholeDay(context, school, heightDp >= 330);
    }

    private static RemoteViews today(Context context, TimingSchool school) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.timing_widget_day_compact);
        cookie(context, views, school.cycle(), 40, 19);
        text(views, R.id.timing_corner, weekday(school.now));
        nowBlock(context, views, school, 150);
        views.removeAllViews(R.id.timing_rows);
        List<TimingSchool.Lesson> rows = school.upcoming();
        if (rows.isEmpty() && school.nextSchoolDay() != null) rows = school.nextSchoolDay().lessons;
        for (int i = 0; i < rows.size() && i < 4; i++) {
            if (i > 0) views.addView(R.id.timing_rows, line(context));
            views.addView(R.id.timing_rows, lessonRow(context, R.layout.timing_row_lesson, rows.get(i), rows.get(i).room));
        }
        views.setOnClickPendingIntent(R.id.timing_root, open(context, "timing://today"));
        return views;
    }

    private static RemoteViews wholeDay(Context context, TimingSchool school, boolean withHomework) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.timing_widget_day);
        cookie(context, views, school.cycle(), 52, 24);
        List<TimingSchool.Lesson> lessons = school.lessons();
        text(views, R.id.timing_title, weekday(school.now));
        String date = TimingSchool.format(school.now, "d MMM");
        text(views, R.id.timing_detail, lessons.isEmpty()
            ? date + " · " + (school.day == null ? "No lessons" : school.noticeParts()[0])
            : date + " · " + lessons.size() + " lessons · until " + school.lastEnd());
        views.setOnClickPendingIntent(R.id.timing_add, open(context, "timing://homework/new"));

        views.removeAllViews(R.id.timing_rows);
        TimingSchool.Lesson current = school.current();
        String notice = school.day == null ? "" : school.day.notice;
        if (lessons.isEmpty()) {
            TimingSchool.Day next = school.nextSchoolDay();
            String[] parts = school.noticeParts();
            notice = school.phase() == TimingSchool.Phase.SPECIAL ? parts[1] : "";
            if (next != null) {
                String back = "Back " + weekday(TimingSchool.dateMs(next.date)) + (next.cycle.isEmpty() ? "" : " · Day " + next.cycle);
                notice = notice.isEmpty() ? back : notice + "\n" + back;
                lessons = next.lessons;
            }
        }
        text(views, R.id.timing_foot, notice);
        views.setTextColor(R.id.timing_foot, color(context, school.phase() == TimingSchool.Phase.NO_SCHOOL
            ? R.color.timing_ink2 : R.color.timing_warm));
        for (TimingSchool.Lesson lesson : lessons) {
            if (current != null && lesson == current) {
                RemoteViews row = lessonRow(context, R.layout.timing_row_lesson_now, lesson,
                    TimingSchool.minutesUntil(school.now, lesson.endMs) + " MIN");
                row.setTextColor(R.id.timing_row_place, color(context, R.color.timing_accent));
                views.addView(R.id.timing_rows, row);
            } else {
                boolean past = lesson.endMs <= school.now;
                views.addView(R.id.timing_rows, lessonRow(context,
                    past ? R.layout.timing_row_lesson_past : R.layout.timing_row_lesson_tight, lesson, lesson.room));
            }
        }

        views.removeAllViews(R.id.timing_tasks);
        List<TimingSchool.Task> tasks = new ArrayList<>();
        for (TimingSchool.Due due : new TimingSchool.Due[] {TimingSchool.Due.TODAY, TimingSchool.Due.OVERDUE, TimingSchool.Due.UPCOMING, TimingSchool.Due.UNCONFIRMED}) {
            for (TimingSchool.Task task : school.homework) if (school.status(task) == due) tasks.add(task);
        }
        boolean show = withHomework && !tasks.isEmpty();
        views.setViewVisibility(R.id.timing_tasks, show ? View.VISIBLE : View.GONE);
        for (int i = 0; show && i < tasks.size() && i < 2; i++) {
            if (i > 0) views.addView(R.id.timing_tasks, line(context));
            views.addView(R.id.timing_tasks, homeworkRow(context, school, tasks.get(i), false));
        }
        views.setOnClickPendingIntent(R.id.timing_root, open(context, "timing://today"));
        return views;
    }

    // ---- Homework rows: the circle completes, the text opens ----

    private static RemoteViews homeworkRow(Context context, TimingSchool school, TimingSchool.Task task, boolean detailed) {
        RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.timing_row_homework);
        TimingSchool.Due due = school.status(task);
        row.setTextViewText(R.id.timing_row_subject, task.title);
        SpannableStringBuilder meta = new SpannableStringBuilder(task.subject).append(" · ");
        int start = meta.length();
        String when;
        if (detailed && due == TimingSchool.Due.OVERDUE) {
            when = "was due " + TimingSchool.format(TimingSchool.dateMs(task.date), "EEE d MMM") + (task.period > 0 ? ", P" + task.period : "");
        } else if (detailed && due == TimingSchool.Due.UPCOMING) {
            when = TimingSchool.format(TimingSchool.dateMs(task.date), "EEE d MMM") + (task.period > 0 ? ", P" + task.period : "")
                + (task.time.isEmpty() ? "" : " " + task.time);
        } else if (detailed && due == TimingSchool.Due.TODAY) {
            when = (task.period > 0 ? "P" + task.period : "today") + (task.time.isEmpty() ? "" : " " + task.time);
        } else {
            when = school.dueText(task, true);
        }
        meta.append(when);
        if (!detailed && (due == TimingSchool.Due.OVERDUE || due == TimingSchool.Due.TODAY)) {
            int tint = color(context, due == TimingSchool.Due.OVERDUE ? R.color.timing_danger : R.color.timing_warm);
            meta.setSpan(new ForegroundColorSpan(tint), start, meta.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            meta.setSpan(new StyleSpan(Typeface.BOLD), start, meta.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        row.setTextViewText(R.id.timing_row_time, meta);
        row.setImageViewResource(R.id.timing_row_ring, due == TimingSchool.Due.OVERDUE ? R.drawable.timing_ring_overdue : R.drawable.timing_ring);
        row.setTextViewText(R.id.timing_row_place, detailed && task.stepsTotal > 0 ? task.stepsDone + " of " + task.stepsTotal + " steps" : "");
        if (!task.id.isEmpty()) {
            row.setOnClickPendingIntent(R.id.timing_row_check, complete(context, task.id));
            row.setContentDescription(R.id.timing_row_check, "Mark " + task.subject + " homework complete");
            row.setOnClickPendingIntent(R.id.timing_row_open, open(context, "timing://homework/" + Uri.encode(task.id)));
        }
        return row;
    }

    // ---- Timeline · 6×2 ----

    private static RemoteViews timeline(Context context, TimingSchool school) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.timing_widget_timeline);
        cookie(context, views, school.cycle(), 40, 19);
        text(views, R.id.timing_title, weekday(school.now));
        text(views, R.id.timing_detail, TimingSchool.format(school.now, "d MMMM"));
        TimingSchool.Lesson current = school.current(), next = school.next();
        String eyebrow;
        int tint = R.color.timing_ink3;
        switch (school.phase()) {
            case LESSON:
                eyebrow = current.subject + " · " + TimingSchool.minutesUntil(school.now, current.endMs) + " min left";
                tint = R.color.timing_accent;
                break;
            case BEFORE_SCHOOL: eyebrow = "First · in " + TimingSchool.minutesUntil(school.now, next.startMs) + " min"; break;
            case BREAK: eyebrow = "Break · " + next.subject + " at " + next.start; break;
            case AFTER_SCHOOL: eyebrow = "Done for today"; break;
            default: eyebrow = school.loaded ? "No lessons" : "Open Timing";
        }
        text(views, R.id.timing_eyebrow, eyebrow);
        views.setTextColor(R.id.timing_eyebrow, color(context, tint));

        List<TimingSchool.Lesson> lessons = school.lessons();
        views.removeAllViews(R.id.timing_rows);
        views.setViewVisibility(R.id.timing_rows, lessons.isEmpty() ? View.GONE : View.VISIBLE);
        for (int i = 0; i < lessons.size(); i++) {
            TimingSchool.Lesson lesson = lessons.get(i);
            if (i > 0 && lessons.get(i - 1).endMs < lesson.startMs) {
                views.addView(R.id.timing_rows, new RemoteViews(context.getPackageName(), R.layout.timing_cell_break));
            }
            RemoteViews cell;
            if (lesson == current) {
                cell = new RemoteViews(context.getPackageName(), R.layout.timing_cell_now);
                cell.setProgressBar(R.id.timing_row_progress, 1000, Math.round(school.progress() * 1000), false);
                cell.setTextViewText(R.id.timing_row_time, lesson.start + " · now");
            } else {
                cell = new RemoteViews(context.getPackageName(), lesson.endMs <= school.now ? R.layout.timing_cell_past : R.layout.timing_cell);
                cell.setTextViewText(R.id.timing_row_time, lesson.start);
            }
            cell.setTextViewText(R.id.timing_row_subject, lesson.subject);
            views.addView(R.id.timing_rows, cell);
        }
        String foot = "";
        if (lessons.isEmpty()) {
            TimingSchool.Day nextDay = school.nextSchoolDay();
            foot = school.day == null ? "" : school.day.label;
            if (nextDay != null) {
                foot += (foot.isEmpty() ? "" : "\n") + "Back " + weekday(TimingSchool.dateMs(nextDay.date))
                    + (nextDay.cycle.isEmpty() ? "" : " · Day " + nextDay.cycle) + " · " + nextDay.lessons.get(0).start + " " + nextDay.lessons.get(0).subject;
            }
        }
        text(views, R.id.timing_foot, foot);
        views.setOnClickPendingIntent(R.id.timing_root, open(context, "timing://today"));
        return views;
    }

    // ---- Homework · 4×3 ----

    private static RemoteViews homework(Context context, TimingSchool school, int heightDp) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.timing_widget_homework);
        text(views, R.id.timing_detail, school.homework.size() + " open");
        views.setOnClickPendingIntent(R.id.timing_add, open(context, "timing://homework/new"));
        views.removeAllViews(R.id.timing_tasks);
        int room = Math.max(2, (heightDp - 110) / 52), shown = 0;
        Object[][] groups = {
            {TimingSchool.Due.OVERDUE, "Overdue", R.color.timing_danger},
            {TimingSchool.Due.TODAY, "Today", R.color.timing_warm},
            {TimingSchool.Due.UPCOMING, "Upcoming", R.color.timing_accent},
            {TimingSchool.Due.UNCONFIRMED, "Date to confirm", R.color.timing_ink3},
        };
        for (Object[] group : groups) {
            boolean headed = false;
            for (TimingSchool.Task task : school.homework) {
                if (school.status(task) != group[0] || shown >= room) continue;
                if (!headed) {
                    if (shown > 0) views.addView(R.id.timing_tasks, line(context));
                    RemoteViews heading = new RemoteViews(context.getPackageName(), R.layout.timing_row_section);
                    heading.setTextViewText(R.id.timing_row_subject, (String) group[1]);
                    heading.setTextColor(R.id.timing_row_subject, color(context, (Integer) group[2]));
                    views.addView(R.id.timing_tasks, heading);
                    headed = true;
                }
                views.addView(R.id.timing_tasks, homeworkRow(context, school, task, true));
                shown++;
            }
        }
        if (shown == 0 || shown < school.homework.size()) {
            RemoteViews more = new RemoteViews(context.getPackageName(), R.layout.timing_row_section);
            more.setTextViewText(R.id.timing_row_subject, shown == 0
                ? (school.loaded ? "Nothing to hand in" : "Open Timing to load homework")
                : "+" + (school.homework.size() - shown) + " more in Timing");
            views.addView(R.id.timing_tasks, more);
        }
        views.setOnClickPendingIntent(R.id.timing_root, open(context, "timing://homework"));
        return views;
    }

    // ---- Next school day · 3×2 ----

    private static RemoteViews nextDay(Context context, TimingSchool school) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.timing_widget_next_day);
        TimingSchool.Day day = school.nextSchoolDay();
        if (day == null) {
            text(views, R.id.timing_title, school.loaded ? "No more" : "Open Timing");
            text(views, R.id.timing_corner, "");
            text(views, R.id.timing_detail, school.loaded ? "No school days left to show" : "to load your timetable");
            views.setViewVisibility(R.id.timing_rows, View.GONE);
            views.setViewVisibility(R.id.timing_foot, View.GONE);
        } else {
            long date = TimingSchool.dateMs(day.date);
            TimingSchool.Lesson first = day.lessons.get(0);
            text(views, R.id.timing_title, weekday(date));
            text(views, R.id.timing_corner, day.cycle.isEmpty() ? "" : "Day " + day.cycle);
            text(views, R.id.timing_detail, TimingSchool.format(date, "d MMMM") + " · " + day.lessons.size() + " lessons");
            views.setViewVisibility(R.id.timing_rows, View.VISIBLE);
            views.setTextViewText(R.id.timing_row_time, first.start);
            views.setTextViewText(R.id.timing_row_subject, first.subject);
            views.setTextViewText(R.id.timing_row_place, first.place());
            TimingSchool.Task due = null;
            for (TimingSchool.Task task : school.homework) {
                if (task.date.equals(day.date) && task.period == first.period) { due = task; break; }
            }
            if (due != null) {
                SpannableStringBuilder foot = new SpannableStringBuilder("Due first lesson: ");
                int start = foot.length();
                foot.append(due.title);
                foot.setSpan(new StyleSpan(Typeface.BOLD), start, foot.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                foot.setSpan(new ForegroundColorSpan(color(context, R.color.timing_on_wash)), start, foot.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                text(views, R.id.timing_foot, foot);
            } else {
                views.setViewVisibility(R.id.timing_foot, View.GONE);
            }
        }
        views.setOnClickPendingIntent(R.id.timing_root, open(context, "timing://today"));
        return views;
    }
}
