package org.automationstack.sdk;

/**
 * 把 Java 源码里的注释剥掉，只留下真正会被编译的部分。
 *
 * <p>{@code NoPreflightTest} 和 {@code ExitSignalTest} 都要在源码里搜某些字样，
 * 而这两个文件的注释里**恰恰**在解释「为什么不这么做」——不剥注释，那些解释
 * 自己就会把测试染红，于是下一个人会去删注释而不是去改代码。
 *
 * <p>是个正经的小状态机而不是正则：字符串字面量里的 {@code //}（比如
 * {@code "https://..."}）不能被当成注释开头。
 */
public final class SourceScan {

    private SourceScan() {
    }

    public static String stripComments(String source) {
        StringBuilder out = new StringBuilder(source.length());
        int index = 0;
        while (index < source.length()) {
            char current = source.charAt(index);
            char next = index + 1 < source.length() ? source.charAt(index + 1) : '\0';
            if (current == '"' || current == '\'') {
                index = copyLiteral(source, index, current, out);
            } else if (current == '/' && next == '/') {
                while (index < source.length() && source.charAt(index) != '\n') {
                    index++;
                }
            } else if (current == '/' && next == '*') {
                index += 2;
                while (index + 1 < source.length()
                        && !(source.charAt(index) == '*' && source.charAt(index + 1) == '/')) {
                    index++;
                }
                index = Math.min(index + 2, source.length());
            } else {
                out.append(current);
                index++;
            }
        }
        return out.toString();
    }

    private static int copyLiteral(String source, int start, char quote, StringBuilder out) {
        out.append(quote);
        int index = start + 1;
        while (index < source.length()) {
            char current = source.charAt(index);
            out.append(current);
            index++;
            if (current == '\\' && index < source.length()) {
                out.append(source.charAt(index));
                index++;
            } else if (current == quote) {
                break;
            }
        }
        return index;
    }
}
