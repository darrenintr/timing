package io.github.darrenintr.timing;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

public class TimingWidgetProvider extends AppWidgetProvider {
    private static String today() {
        SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        formatter.setTimeZone(TimeZone.getTimeZone("Asia/Hong_Kong"));
        return formatter.format(new Date());
    }

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, TimingWidgetProvider.class));
        if (ids.length > 0) render(context, manager, ids);
    }

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        render(context, manager, ids);
    }

    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (Intent.ACTION_DATE_CHANGED.equals(action) || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)) updateAll(context);
    }

    private static void render(Context context, AppWidgetManager manager, int[] ids) {
        String date = today();
        String header = "Today · " + date;
        String lessons = "Open Timing to load your timetable.";
        String homework = "No upcoming homework";
        try {
            JSONObject snapshot = new JSONObject(context.getSharedPreferences("timing-widget", 0).getString("data", "{}"));
            JSONArray days = snapshot.optJSONArray("days");
            if (days != null) {
                lessons = "No S6 lessons today";
                for (int i = 0; i < days.length(); i++) {
                    JSONObject day = days.optJSONObject(i);
                    if (day == null || !date.equals(day.optString("date"))) continue;
                    String cycle = day.optString("cycle", "");
                    header = "Today · " + date + (cycle.isEmpty() || cycle.equals("null") ? "" : " · Day " + cycle);
                    JSONArray rows = day.optJSONArray("lessons");
                    if (rows != null && rows.length() > 0) {
                        StringBuilder list = new StringBuilder();
                        for (int j = 0; j < rows.length(); j++) {
                            JSONObject row = rows.optJSONObject(j);
                            if (row == null) continue;
                            if (list.length() > 0) list.append('\n');
                            list.append("P").append(row.optInt("period")).append("  ")
                                .append(row.optString("time")).append("  ").append(row.optString("subject"));
                        }
                        lessons = list.toString();
                    } else {
                        lessons = day.optString("label", lessons);
                    }
                    break;
                }
            }
            JSONArray tasks = snapshot.optJSONArray("homework");
            if (tasks != null) {
                StringBuilder list = new StringBuilder();
                for (int i = 0; i < tasks.length() && i < 3; i++) {
                    JSONObject task = tasks.optJSONObject(i);
                    if (task == null) continue;
                    String due = task.optString("date", "");
                    if (due.equals("null")) due = "";
                    if (!due.isEmpty() && due.compareTo(date) < 0) due = "Overdue · " + due;
                    if (list.length() > 0) list.append('\n');
                    list.append(task.optString("subject")).append(" · ").append(task.optString("title"));
                    if (!due.isEmpty()) list.append(" · ").append(due);
                }
                if (list.length() > 0) homework = list.toString();
            }
        } catch (Exception ignored) { /* Keep a useful placeholder if stored data is corrupt. */ }
        for (int id : ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.timing_widget);
            views.setTextViewText(R.id.timing_date, header);
            views.setTextViewText(R.id.timing_lessons, lessons);
            views.setTextViewText(R.id.timing_homework, homework);
            Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (launch != null) views.setOnClickPendingIntent(R.id.timing_widget_root,
                PendingIntent.getActivity(context, id, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            manager.updateAppWidget(id, views);
        }
    }
}
