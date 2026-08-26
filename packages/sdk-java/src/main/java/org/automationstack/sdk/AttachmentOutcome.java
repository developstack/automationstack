package org.automationstack.sdk;

import java.util.ArrayList;
import java.util.List;

/**
 * 附件那一轮的结果，**只用来打印——它不参与退出码判定**（§5.6）。
 *
 * <p>R2 没配置、配额用完都只是降级，结论那一轮早就写进去了；让附件拖垮一次成功的
 * 上报是最没道理的失败方式（同第二期 D9）。
 *
 * <p>是可变的：上传过程中逐批往里累加，与 Node / Python 两家的形状一致。
 */
public final class AttachmentOutcome {

    private int registered;
    private int uploaded;
    /** R2 未配置时 false：结论照常上报成功，只有附件部分降级。 */
    private boolean storageConfigured = true;
    /** 逐条的拒绝理由，**服务端原文**，SDK 不概括。 */
    private final List<String> rejections = new ArrayList<>();

    public int registered() {
        return registered;
    }

    public int uploaded() {
        return uploaded;
    }

    public boolean storageConfigured() {
        return storageConfigured;
    }

    public List<String> rejections() {
        return rejections;
    }

    void addRegistered(int count) {
        registered += count;
    }

    void addUploaded(int count) {
        uploaded += count;
    }

    void degradeStorage(boolean configured) {
        storageConfigured = storageConfigured && configured;
    }

    /**
     * 读盘失败的那几条排在**最前面**：它们是本地问题，人先看到它才不会跑去平台上
     * 查一个根本没发出去的附件。
     */
    void prependRejections(List<String> lines) {
        rejections.addAll(0, lines);
    }
}
