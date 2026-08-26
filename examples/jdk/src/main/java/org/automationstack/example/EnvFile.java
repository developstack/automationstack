package org.automationstack.example;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 三十行的 {@code .env} 读取器。
 *
 * <p>不为读三行配置装第四个包（Node 那边靠 {@code --env-file-if-exists}，
 * Java 运行时没有对等物）。
 *
 * <p>⚠️ **Java 改不了自己进程的环境变量**——{@code System.getenv()} 返回的是
 * 只读视图，JDK 里没有 {@code os.environ["X"] = ...} 这种东西。所以这份文件的用法
 * 只有一种：把读出来的 Map 交给 SDK 的 {@code env(...)}，让它拿这份而不是
 * {@code System.getenv()} 去解析配置。
 *
 * <p>跑 JUnit 那条路径（{@code mvn test}）没有这个seam，因为薄壳是自己 new 的
 * reporter。那边只能在**进程之外**把变量导进来：
 * <pre>{@code set -a && . ./.env && set +a && mvn test}</pre>
 * README 里写的就是这一句。
 */
public final class EnvFile {

    private EnvFile() {
    }

    /** 已经在环境里的变量优先——CI 上的 secret 不该被谁忘了删的一份本地文件顶掉。 */
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
            // 读不到就当没有：真正缺配置时 SDK 会在解析那一步抛一句指着变量名的话，
            // 比这里编一句「.env 读取失败」有用。
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
