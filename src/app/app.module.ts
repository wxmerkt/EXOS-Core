import { BrowserModule } from '@angular/platform-browser';
import { LOCALE_ID, NgModule } from '@angular/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { RootComponent } from './components/root/root.component';
import { MaterialModule } from './material.module';
import { HttpClientModule } from '@angular/common/http';
import { AppRoutingModule } from './app-routing.module';
import { DashboardModule } from './components/dashboard/dashboard.module';
import { RootModule } from './components/root/root.module';
import { NotFoundModule } from './components/not-found/not-found.module';
import { WalletModule } from './components/wallet/wallet.module';
import { SettingsModule } from './components/settings/settings.module';
import { LoginModule } from './components/login/login.module';
import { LogoutModule } from './components/logout/logout.module';
import { SwapsModule } from './components/swaps/swaps.module';
import { AboutModule } from './components/about/about.module';
import { AppSharedModule } from './shared/app-shared.module';
import { APP_TITLE } from './services/title.service';
import { FormsModule } from '@angular/forms';
import { Theming } from './services/theming.service';
import { ApiService } from './services/api.service';
import { ElectronService } from 'ngx-electron';
import { GlobalService } from './services/global.service';
import { LoadModule } from './components/load/load.module';
import { NetworkModule } from './components/network/network.module';
import { DetailsModule } from './components/details/details.module';
import { environment } from '../environments/environment';
import { ChainService } from './services/chain.service';
import { LocaleService } from './services/locale.service';
import { UpdateModule } from './components/update/update.module';
import { HistoryModule } from './components/history/history.module';
import { AdvancedModule } from './components/advanced/advanced.module';
import { Logger } from './services/logger.service';
import { httpInterceptorProviders } from './shared/http-interceptors';
import { HttpErrorHandler } from './services/http-error-handler.service';
import { ToolsModule } from './components/tools/tools.module';
import { NotificationsModule } from './components/notifications/notifications.module';
import { ReportModule } from './components/report/report.module';
import { FlexLayoutModule } from '@angular/flex-layout';
import { HubService } from './services/hub.service';
import localeEN from '@angular/common/locales/en';
import localeES from '@angular/common/locales/es';
import localezFR from '@angular/common/locales/fr';
import localezIT from '@angular/common/locales/it';
import { registerLocaleData } from '@angular/common';

registerLocaleData(localeEN);
registerLocaleData(localeES);
registerLocaleData(localezFR);
registerLocaleData(localezIT);

@NgModule({
    declarations: [
    ],
    imports: [
        BrowserModule,
        BrowserAnimationsModule,
        FormsModule,
        HttpClientModule,
        MaterialModule,
        RootModule,
        DashboardModule,
        NotificationsModule,
        WalletModule,
        SettingsModule,
        LoginModule,
        LogoutModule,
        SwapsModule,
        AboutModule,
        AppSharedModule,
        LoadModule,
        NetworkModule,
        NotFoundModule,
        ReportModule,
        UpdateModule,
        DetailsModule,
        AdvancedModule,
        ToolsModule,
        HistoryModule,
        AppRoutingModule,
        FlexLayoutModule,
    ],
    exports: [
    ],
    providers: [
        HttpErrorHandler,
        httpInterceptorProviders,
        // ApiService,
        // HubService,
        // ChainService,
        ElectronService,
        // GlobalService,
        { provide: APP_TITLE, useValue: 'EXOS Core' },
        {
            provide: LOCALE_ID,
            deps: [LocaleService],
            useFactory: (Locale: { locale: any; }) => Locale.locale
        }
    ],
    bootstrap: [RootComponent]
})
export class AppModule {
    constructor(theming: Theming, log: Logger) {
        log.info('Environment: ' + environment.environment);
        theming.start();
    }
}
