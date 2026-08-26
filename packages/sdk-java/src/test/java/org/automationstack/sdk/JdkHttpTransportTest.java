package org.automationstack.sdk;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.http.HttpClient;
import org.junit.jupiter.api.Test;

/**
 * 这一整个文件都是**回归测试**：默认 transport 的两条配置各自对应一次真实事故，
 * 改回默认值都不会让别的测试变红，只会让某一类用户完全用不了。
 */
class JdkHttpTransportTest {

    /**
     * ⚠️ 这条红了不要去改断言，去看 {@link JdkHttpTransport#newClient()} 上的注释。
     *
     * <p>JDK 默认是 {@code HTTP_2}。对 {@code http://} 它会尝试 h2c 明文升级并等 101，
     * 而 Node 起的服务端不回——表现是每个请求挂满超时、重试三轮全挂，
     * 同一地址 curl 秒回 200。自建部署用 http 是常态，等于这批用户一次都传不上去。
     */
    @Test
    void pinsHttp11SoPlaintextUploadsDoNotHangOnH2cUpgrade() {
        assertEquals(HttpClient.Version.HTTP_1_1, JdkHttpTransport.newClient().version());
    }

    /** 跟随重定向会把 Authorization 头带到别的主机上，是泄露 token 的经典方式。 */
    @Test
    void neverFollowsRedirectsSoTheTokenCannotLeakToAnotherHost() {
        assertEquals(HttpClient.Redirect.NEVER, JdkHttpTransport.newClient().followRedirects());
    }

    /**
     * 一个进程共用一个实例：{@link HttpClient} 内部带连接池，每次请求新建一个等于每次
     * 重新握手，一轮几百个附件时那笔开销很可观。把构造器关掉是这条约束唯一执行得了的地方——
     * 光写注释挡不住谁 {@code new} 一个。
     */
    @Test
    void hasNoPublicConstructorSoNobodyAccidentallyCreatesAPoolPerRequest() {
        assertEquals(0, JdkHttpTransport.class.getConstructors().length);
        assertTrue(JdkHttpTransport.INSTANCE instanceof Transport);
    }
}
