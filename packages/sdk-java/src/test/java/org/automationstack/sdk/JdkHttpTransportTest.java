package org.automationstack.sdk;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.http.HttpClient;
import org.junit.jupiter.api.Test;

class JdkHttpTransportTest {

    @Test
    void pinsHttp11SoPlaintextUploadsDoNotHangOnH2cUpgrade() {
        assertEquals(HttpClient.Version.HTTP_1_1, JdkHttpTransport.newClient().version());
    }

    @Test
    void neverFollowsRedirectsSoTheTokenCannotLeakToAnotherHost() {
        assertEquals(HttpClient.Redirect.NEVER, JdkHttpTransport.newClient().followRedirects());
    }

    @Test
    void hasNoPublicConstructorSoNobodyAccidentallyCreatesAPoolPerRequest() {
        assertEquals(0, JdkHttpTransport.class.getConstructors().length);
        assertTrue(JdkHttpTransport.INSTANCE instanceof Transport);
    }
}
