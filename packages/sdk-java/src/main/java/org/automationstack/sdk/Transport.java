package org.automationstack.sdk;

@FunctionalInterface
public interface Transport {

    HttpResponse send(HttpRequest request) throws Exception;
}
