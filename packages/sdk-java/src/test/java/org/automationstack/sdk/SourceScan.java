package org.automationstack.sdk;

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
