package org.automationstack.example;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

public final class EnvFile {

    private EnvFile() {
    }

    public static Map<String, String> load(Path file) {
        Map<String, String> merged = new LinkedHashMap<>(readFile(file));
        merged.putAll(System.getenv());
        return merged;
    }

    public static Map<String, String> load() {
        return load(Path.of(".env"));
    }

    private static Map<String, String> readFile(Path file) {
        Map<String, String> values = new LinkedHashMap<>();
        if (!Files.isReadable(file)) {
            return values;
        }
        try {
            for (String rawLine : Files.readAllLines(file, StandardCharsets.UTF_8)) {
                String line = rawLine.strip();
                if (line.isEmpty() || line.startsWith("#")) {
                    continue;
                }
                int equals = line.indexOf('=');
                if (equals <= 0) {
                    continue;
                }
                values.put(line.substring(0, equals).strip(), unquote(line.substring(equals + 1).strip()));
            }
        } catch (IOException error) {
            return values;
        }
        return values;
    }

    private static String unquote(String value) {
        if (value.length() >= 2
                && ((value.startsWith("\"") && value.endsWith("\""))
                        || (value.startsWith("'") && value.endsWith("'")))) {
            return value.substring(1, value.length() - 1);
        }
        return value;
    }
}
