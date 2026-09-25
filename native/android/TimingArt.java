package io.github.darrenintr.timing;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Rect;
import android.graphics.Typeface;

/** Material 3 Expressive shapes and wavy progress, drawn as bitmaps because RemoteViews cannot draw paths. */
final class TimingArt {
    static final int COOKIE_LOBES = 9;
    static final float COOKIE_DEPTH = 0.07f;
    static final int BURST_LOBES = 12;
    static final float BURST_DEPTH = 0.1f;

    private TimingArt() {}

    private static float density(Context context) { return context.getResources().getDisplayMetrics().density; }

    /** The same blob as src/shapes.js, in a size × size box. */
    private static Path blob(float size, int lobes, float depth) {
        Path path = new Path();
        float scale = size / 100f, rotation = (float) (-Math.PI / 2);
        for (int i = 0; i < 180; i++) {
            double angle = 2 * Math.PI * i / 180;
            double radius = 48 * (1 + depth * Math.cos(lobes * (angle - rotation))) / (1 + depth);
            float x = (float) (50 + radius * Math.cos(angle)) * scale, y = (float) (50 + radius * Math.sin(angle)) * scale;
            if (i == 0) path.moveTo(x, y); else path.lineTo(x, y);
        }
        path.close();
        return path;
    }

    /** A shape with a centred label: the cycle letter in the cookie, the homework count in the burst. */
    static Bitmap badge(Context context, int sizeDp, int lobes, float depth, int fill, String label, int ink, boolean italic, float textDp) {
        float density = density(context);
        int size = Math.max(1, Math.round(sizeDp * density));
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(fill);
        canvas.drawPath(blob(size, lobes, depth), paint);
        paint.setColor(ink);
        paint.setTypeface(Typeface.create(Typeface.SERIF, italic ? Typeface.BOLD_ITALIC : Typeface.BOLD));
        paint.setTextSize(textDp * density);
        paint.setTextAlign(Paint.Align.CENTER);
        Rect bounds = new Rect();
        paint.getTextBounds(label, 0, label.length(), bounds);
        canvas.drawText(label, size / 2f, size / 2f - bounds.exactCenterY(), paint);
        return bitmap;
    }

    /** Wavy progress for the current lesson, a flat track for what is left, and a stop dot at the end. */
    static Bitmap wave(Context context, int widthDp, float progress, int color, int track) {
        float density = density(context);
        int width = Math.max(1, Math.round(widthDp * density)), height = Math.round(10 * density);
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeWidth(3.5f * density);
        float mid = height / 2f, start = 2 * density, end = width - 8 * density;
        float reach = start + (end - start) * Math.max(0f, Math.min(1f, progress));
        if (reach > start + density) {
            Path path = new Path();
            path.moveTo(start, mid);
            float half = 6 * density, amplitude = 2 * density;
            boolean up = true;
            for (float x = start; x < reach; x += half) {
                float next = Math.min(x + half, reach), fraction = (next - x) / half;
                path.quadTo(x + half / 2 * fraction, mid + (up ? -2 : 2) * amplitude * fraction, next, mid);
                up = !up;
            }
            paint.setColor(color);
            canvas.drawPath(path, paint);
        }
        float trackStart = reach + 6 * density;
        if (trackStart < end) {
            paint.setColor(track);
            canvas.drawLine(trackStart, mid, end, mid, paint);
        }
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(color);
        canvas.drawCircle(width - 3 * density, mid, 2 * density, paint);
        return bitmap;
    }
}
