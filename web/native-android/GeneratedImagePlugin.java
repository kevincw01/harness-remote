package ai.harness.remote;

import android.content.ContentValues;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "GeneratedImage")
public class GeneratedImagePlugin extends Plugin {
    private static final String AUTHORITY_SUFFIX = ".fileprovider";
    private static final String GENERATED_IMAGE_DIRECTORY = "generated-images";

    @PluginMethod
    public void open(PluginCall call) {
        if (getActivity() == null) {
            call.reject("The Android activity is not ready");
            return;
        }
        try {
            byte[] bytes = decode(call);
            String mime = call.getString("mime", "image/png");
            String filename = safeFilename(call.getString("filename", "generated-image.png"));
            File directory = new File(getContext().getCacheDir(), GENERATED_IMAGE_DIRECTORY);
            if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("Could not create the image cache");
            File file = new File(directory, filename);
            try (FileOutputStream output = new FileOutputStream(file)) {
                output.write(bytes);
            }
            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + AUTHORITY_SUFFIX,
                file
            );
            Intent view = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, mime)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().runOnUiThread(() -> getActivity().startActivity(Intent.createChooser(view, "Open image")));
            call.resolve();
        } catch (Exception error) {
            call.reject(error.getMessage() != null ? error.getMessage() : "Could not open the image", error);
        }
    }

    @PluginMethod
    public void save(PluginCall call) {
        try {
            byte[] bytes = decode(call);
            String mime = call.getString("mime", "image/png");
            String filename = safeFilename(call.getString("filename", "generated-image.png"));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, filename);
                values.put(MediaStore.Images.Media.MIME_TYPE, mime);
                values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Harness Remote");
                values.put(MediaStore.Images.Media.IS_PENDING, 1);
                Uri uri = getContext().getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IllegalStateException("Android did not create a Pictures entry");
                try (OutputStream output = getContext().getContentResolver().openOutputStream(uri)) {
                    if (output == null) throw new IllegalStateException("Android did not open the Pictures file");
                    output.write(bytes);
                }
                values.clear();
                values.put(MediaStore.Images.Media.IS_PENDING, 0);
                getContext().getContentResolver().update(uri, values, null, null);
                toast("Saved to Pictures/Harness Remote");
                JSObject result = new JSObject();
                result.put("saved", true);
                result.put("location", "Pictures/Harness Remote");
                call.resolve(result);
                return;
            }

            String location = MediaStore.Images.Media.insertImage(
                getContext().getContentResolver(),
                BitmapFactory.decodeByteArray(bytes, 0, bytes.length),
                filename,
                null
            );
            if (location == null) throw new IllegalStateException("Android did not save the image");
            toast("Saved to Pictures");
            JSObject result = new JSObject();
            result.put("saved", true);
            result.put("location", "Pictures");
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage() != null ? error.getMessage() : "Could not save the image", error);
        }
    }

    private byte[] decode(PluginCall call) {
        String dataURL = call.getString("dataURL", "");
        int comma = dataURL.indexOf(',');
        if (!dataURL.startsWith("data:") || comma < 0 || !dataURL.substring(0, comma).contains(";base64")) {
            throw new IllegalArgumentException("The image data is not a base64 data URL");
        }
        return Base64.decode(dataURL.substring(comma + 1), Base64.DEFAULT);
    }

    private String safeFilename(String value) {
        String filename = value == null ? "generated-image.png" : value.replaceAll("[^A-Za-z0-9._-]", "_");
        if (!filename.contains(".")) filename += ".png";
        return filename;
    }

    private void toast(String message) {
        if (getActivity() == null) return;
        getActivity().runOnUiThread(() -> Toast.makeText(getContext(), message, Toast.LENGTH_SHORT).show());
    }
}
