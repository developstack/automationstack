package org.automationstack.sdk;

/**
 * 一次请求进、一次响应出。**抛异常 = 网络层没接通**（可重试）。
 *
 * <p>这一层抽象存在的唯一目的是**让测试不连网**：假 transport 直接返回构造好的响应，
 * 整个测试套件里没有一个 socket。真连网的测试会在 CI 上按别人的网络状况随机红，
 * 而这里要验的每一件事——分批、幂等键、对账单、退出码——都跟网络无关。
 * （Node 版那边对应的是 {@code FetchLike}，Python 那边是 {@code Transport}。）
 */
@FunctionalInterface
public interface Transport {

    HttpResponse send(HttpRequest request) throws Exception;
}
