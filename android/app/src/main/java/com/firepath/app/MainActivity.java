package com.firepath.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * 기기 설정의 글자 크기를 무시하고 웹뷰 배율을 100%로 고정한다.
     *
     * 안드로이드 웹뷰는 기기 설정(설정 > 디스플레이 > 글자 크기)을 textZoom에 자동으로 반영하는데,
     * 앱에도 자체 글자 크기 조절(설정 > 화면 설정, 75~150%)이 있어서 두 배율이 곱해진다.
     * 시스템을 크게 올려둔 기기에서 글자가 과하게 커지고 화면이 깨지던 원인이다.
     * 100으로 고정하면 앱 안의 조절만 적용된다.
     *
     * 시스템 글자 크기를 바꾸면 액티비티가 재생성된다(AndroidManifest의 configChanges에 fontScale이
     * 없다) — 그때 이 onCreate가 다시 돌면서 다시 고정하므로 별도 처리가 필요 없다.
     */
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 웹뷰를 못 만든 기기에서는 BridgeActivity가 bridge를 만들지 않고 대체 화면을 띄운다.
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().getSettings().setTextZoom(100);
        }
    }
}
