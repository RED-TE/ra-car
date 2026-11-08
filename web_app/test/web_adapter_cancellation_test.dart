@TestOn('browser')
library;

// SYNTHETIC ONLY. Native XHR.send is replaced for every test: network sends=0.
import 'dart:async';
import 'dart:js_interop';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recar_app/services/web/managed_browser_adapter.dart';
import 'package:recar_app/services/api_client.dart';

@JS('eval')
external JSAny? _evaluate(JSString script);

int get sentCount =>
    (_evaluate('globalThis.__recarSends.length'.toJS) as JSNumber).toDartInt;
void succeed() => _evaluate('''
const xhr = globalThis.__recarSends.at(-1).xhr;
Object.defineProperties(xhr, {
 status: {value:200}, statusText: {value:'OK'},
 response: {value:new TextEncoder().encode('{"ok":true}').buffer},
 responseURL: {value:'http://127.0.0.1:9/SYNTHETIC'},
});
xhr.getAllResponseHeaders = () => 'content-type: application/json';
xhr.dispatchEvent(new ProgressEvent('load'));
'''
    .toJS);

Future<void> eventTurn() => Future<void>.delayed(Duration.zero);

Future<List<Object>> collectUncaught(Future<void> Function() action) async {
  final errors = <Object>[];
  final done = Completer<void>();
  runZonedGuarded(() async {
    try {
      await action();
      done.complete();
    } catch (error, stack) {
      done.completeError(error, stack);
    }
  }, (error, stack) {
    errors.add(error);
  });
  await done.future.timeout(const Duration(seconds: 3));
  return errors;
}

void main() {
  test('web ApiClient installs the cancellation-safe transport', () {
    expect(ApiClient.dio.httpClientAdapter, isA<BrowserHttpClientAdapter>());
  });
  late BrowserHttpClientAdapter adapter;
  setUp(() {
    _evaluate('''
  globalThis.__recarOriginalSend=XMLHttpRequest.prototype.send;
  globalThis.__recarSends=[];
  XMLHttpRequest.prototype.send=function(body){globalThis.__recarSends.push({xhr:this,body});};
  '''
        .toJS);
    adapter = BrowserHttpClientAdapter();
  });
  tearDown(() {
    adapter.close(force: true);
    _evaluate(
        'XMLHttpRequest.prototype.send=globalThis.__recarOriginalSend;'.toJS);
  });
  RequestOptions options({Duration? connectTimeout}) => RequestOptions(
      method: 'POST',
      path: 'http://127.0.0.1:9/SYNTHETIC',
      connectTimeout: connectTimeout);

  for (final lateBodyError in [false, true]) {
    test(
        'pending body cancellation settles promptly and forbids late send error=$lateBodyError',
        () async {
      final body = StreamController<Uint8List>();
      final cancel = Completer<void>();
      bool settledBeforeBody = false;
      Object? failure;
      final uncaught = await collectUncaught(() async {
        bool settled = false;
        final pending = adapter
            .fetch(options(), body.stream, cancel.future)
            .then<void>((_) {
          settled = true;
        }, onError: (Object e) {
          failure = e;
          settled = true;
        });
        cancel.complete();
        await eventTurn();
        await eventTurn();
        settledBeforeBody = settled;
        if (lateBodyError) {
          body.addError(StateError('SYNTHETIC late body error'));
        } else {
          body.add(Uint8List.fromList([123, 125]));
        }
        await body.close();
        await pending.timeout(const Duration(milliseconds: 100));
        await eventTurn();
      });
      expect(uncaught, isEmpty);
      expect(settledBeforeBody, isTrue);
      expect(
          failure,
          isA<DioException>()
              .having((e) => e.type, 'type', DioExceptionType.cancel));
      expect(sentCount, 0);
      expect(adapter.xhrs, isEmpty);
    });
  }
  test('already cancelled token prevents body transmission', () async {
    final cancel = Completer<void>()..complete();
    Object? failure;
    final uncaught = await collectUncaught(() async {
      await adapter
          .fetch(options(), Stream.value(Uint8List.fromList([123, 125])),
              cancel.future)
          .then<void>((_) {}, onError: (Object e) {
        failure = e;
      });
      await eventTurn();
    });
    expect(uncaught, isEmpty);
    expect(
        failure,
        isA<DioException>()
            .having((e) => e.type, 'type', DioExceptionType.cancel));
    expect(sentCount, 0);
  });
  test('normal POST preserves bytes and response', () async {
    ResponseBody? result;
    final uncaught = await collectUncaught(() async {
      final pending = adapter.fetch(
          options(), Stream.value(Uint8List.fromList([123, 125])), null);
      await eventTurn();
      expect(sentCount, 1);
      expect(
          (_evaluate('Array.from(globalThis.__recarSends[0].body).join(",")'
                  .toJS) as JSString)
              .toDart,
          '123,125');
      succeed();
      result = await pending;
    });
    expect(uncaught, isEmpty);
    expect(result?.statusCode, 200);
    expect(adapter.xhrs, isEmpty);
  });
  test('in-flight POST cancellation remains a cancellation', () async {
    final cancel = Completer<void>();
    Object? failure;
    final uncaught = await collectUncaught(() async {
      final pending = adapter
          .fetch(options(), Stream.value(Uint8List.fromList([123, 125])),
              cancel.future)
          .then<void>((_) {}, onError: (Object e) {
        failure = e;
      });
      await eventTurn();
      expect(sentCount, 1);
      cancel.complete();
      await pending;
      await eventTurn();
    });
    expect(uncaught, isEmpty);
    expect(
        failure,
        isA<DioException>()
            .having((e) => e.type, 'type', DioExceptionType.cancel));
    expect(sentCount, 1);
    expect(adapter.xhrs, isEmpty);
  });
  test('body failure reaches caller unchanged without sending', () async {
    final failure = StateError('SYNTHETIC encoding failed');
    Object? observed;
    final uncaught = await collectUncaught(() async {
      await adapter
          .fetch(options(), Stream.error(failure), null)
          .then<void>((_) {}, onError: (Object e) {
        observed = e;
      });
      await eventTurn();
    });
    expect(uncaught, isEmpty);
    expect(observed, same(failure));
    expect(sentCount, 0);
    expect(adapter.xhrs, isEmpty);
  });
  test('timeout before body finishes is prompt and prevents late send',
      () async {
    final body = StreamController<Uint8List>();
    Object? failure;
    bool settledBeforeBody = false;
    final uncaught = await collectUncaught(() async {
      bool settled = false;
      final pending = adapter
          .fetch(options(connectTimeout: const Duration(milliseconds: 5)),
              body.stream, null)
          .then<void>((_) {
        settled = true;
      }, onError: (Object e) {
        failure = e;
        settled = true;
      });
      await Future<void>.delayed(const Duration(milliseconds: 20));
      settledBeforeBody = settled;
      body.add(Uint8List.fromList([123, 125]));
      await body.close();
      await pending;
      await eventTurn();
    });
    expect(uncaught, isEmpty);
    expect(settledBeforeBody, isTrue);
    expect(
        failure,
        isA<DioException>()
            .having((e) => e.type, 'type', DioExceptionType.connectionTimeout));
    expect(sentCount, 0);
    expect(adapter.xhrs, isEmpty);
  });
}
