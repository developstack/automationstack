package org.automationstack.sdk;

import java.util.List;
import java.util.Map;

/**
 * 手写的 JSON 编码器。**包内可见，不是公开 API**——它只够用来编码本包发出去的那几种报文。
 *
 * <h2>为什么不引 Jackson / Gson</h2>
 *
 * Java 生态里「测试上报 SDK 引一个 JSON 库」是最典型的踩坑方式：用户项目里几乎一定
 * 已经有一个 Jackson（Spring Boot 带的、REST Assured 带的、Testcontainers 带的），
 * 我们再钉死一个大版本，两边就得互相等——他升 Spring Boot 要等我们放开上界，
 * 我们修一个 CVE 要等他敢动 Jackson。而 Maven 的依赖仲裁是「最近者胜」，
 * 版本一旦被别人拽走，出问题的时机是**测试全跑完之后上报的那一刻**，
 * 也就是最贵的那一刻（NoSuchMethodError 在 databind 的大版本之间是家常便饭）。
 *
 * 换来的风险有多大？ingest 的报文形状是**完全已知的一小块**：四条路由、十来个字段、
 * 值只有字符串 / 整数 / 布尔 / 数组 / 对象 / null 六种，没有多态、没有日期类型、
 * 没有自定义序列化。手写两百行把上面那个风险整个换掉，是划算的。
 *
 * 这和「SDK 不绑定任何测试框架」（见 {@link CaseResultInput} 顶部）是同一条理由：
 * 凡是会把本包的大版本焊死在别人版本上的东西，一律不引。
 *
 * <p>值的映射与 {@link JsonParser} 对称：{@code Map} / {@code List} / {@code String} /
 * {@code Long}、{@code Integer} / {@code Double} / {@code Boolean} / {@code null}。
 * 对象的键序**就是 Map 的迭代序**，所以构造报文时一律用 {@link java.util.LinkedHashMap}：
 * 服务端不在意键序，但测试要断言请求体、人要读日志，稳定的键序值这点力气。
 */
final class Json {

    /** 与 {@link JsonParser} 同一个上限。本包的报文最深也就三层，六十四层只可能是环。 */
    private static final int MAX_DEPTH = 64;

    private Json() {
    }

    static String encode(Object value) {
        StringBuilder out = new StringBuilder();
        write(out, value, 0);
        return out.toString();
    }

    private static void write(StringBuilder out, Object value, int depth) {
        if (depth > MAX_DEPTH) {
            throw new IllegalArgumentException("JSON 嵌套超过 " + MAX_DEPTH + " 层，多半是自引用");
        }
        switch (value) {
            case null -> out.append("null");
            case String text -> writeString(out, text);
            case Boolean flag -> out.append(flag.booleanValue() ? "true" : "false");
            case Integer number -> out.append(number.intValue());
            case Long number -> out.append(number.longValue());
            case Double number -> writeDouble(out, number.doubleValue());
            case Map<?, ?> map -> writeObject(out, map, depth);
            case List<?> list -> writeArray(out, list, depth);
            default -> throw new IllegalArgumentException(
                    "不认识的 JSON 值类型：" + value.getClass().getName()
                            + "——本包只发字符串/整数/布尔/数组/对象/null 六种");
        }
    }

    private static void writeObject(StringBuilder out, Map<?, ?> map, int depth) {
        out.append('{');
        boolean first = true;
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            if (!first) {
                out.append(',');
            }
            first = false;
            if (!(entry.getKey() instanceof String key)) {
                throw new IllegalArgumentException("JSON 对象的键必须是字符串：" + entry.getKey());
            }
            writeString(out, key);
            out.append(':');
            write(out, entry.getValue(), depth + 1);
        }
        out.append('}');
    }

    private static void writeArray(StringBuilder out, List<?> list, int depth) {
        out.append('[');
        for (int index = 0; index < list.size(); index++) {
            if (index > 0) {
                out.append(',');
            }
            write(out, list.get(index), depth + 1);
        }
        out.append(']');
    }

    /**
     * 本包发出去的报文里其实一个小数都没有（durationMs / sizeBytes / updated 全是整数）。
     * 这里仍然处理 double，是为了让「把解析回来的东西再编码回去」这条路走得通（测试里会用）。
     * NaN / Infinity 直接抛：JSON 没有它们的写法，静默写成 null 会让一个坏数字
     * 变成一个看起来正常的缺字段。
     */
    private static void writeDouble(StringBuilder out, double value) {
        if (Double.isNaN(value) || Double.isInfinite(value)) {
            throw new IllegalArgumentException("JSON 里没有 NaN / Infinity 的写法：" + value);
        }
        if (value == Math.rint(value) && Math.abs(value) < 1e15) {
            out.append((long) value);
            return;
        }
        out.append(value);
    }

    /**
     * 字符串转义。与 {@code JSON.stringify} 对齐到**逐字节**：
     * 只转义必须转义的那些（引号、反斜杠、C0 控制字符），中文原样输出**不转成 \\u**
     * ——Python 那边是 {@code ensure_ascii=False}，Node 那边本来就不转，
     * 三家发出去的字节一致时，抓包比对才有意义。
     *
     * <p>落单的代理项（截断 message 时可能把一对 emoji 劈开）转成 {@code \\uXXXX}：
     * 直接输出会产生非法 UTF-8，有的反代会当成坏请求直接 400。
     * ES2019 的 well-formed {@code JSON.stringify} 也是这么做的。
     */
    private static void writeString(StringBuilder out, String value) {
        out.append('"');
        for (int index = 0; index < value.length(); index++) {
            char current = value.charAt(index);
            switch (current) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                case '\b' -> out.append("\\b");
                case '\f' -> out.append("\\f");
                default -> {
                    if (current < 0x20 || isLoneSurrogate(value, index)) {
                        out.append(String.format("\\u%04x", (int) current));
                    } else {
                        out.append(current);
                    }
                }
            }
        }
        out.append('"');
    }

    private static boolean isLoneSurrogate(String value, int index) {
        char current = value.charAt(index);
        if (Character.isHighSurrogate(current)) {
            return index + 1 >= value.length() || !Character.isLowSurrogate(value.charAt(index + 1));
        }
        if (Character.isLowSurrogate(current)) {
            return index == 0 || !Character.isHighSurrogate(value.charAt(index - 1));
        }
        return false;
    }
}
