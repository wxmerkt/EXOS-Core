import { Component, ViewEncapsulation, HostBinding, NgZone, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { AuthenticationService } from '../../services/authentication.service';
import { ActivatedRoute, Router } from '@angular/router';
import { ApplicationStateService } from '../../services/application-state.service';
import * as signalR from '@aspnet/signalr';
import { ApiService } from '../../services/api.service';
import { delay, retryWhen, tap } from 'rxjs/operators';
import { Logger } from '../../services/logger.service';
import { HttpClient } from '@angular/common/http';
import { interval, Subscription } from 'rxjs';
import { NodeStatus } from '@models/node-status';
import { ElectronService } from 'ngx-electron';
import { environment } from 'src/environments/environment';
import * as coininfo from 'exos-coininfo';
import { Chain, ChainService } from 'src/app/services/chain.service';
import { StorageService } from 'src/app/services/storage.service';



export interface ListItem {
    name: string;
    id: string;
}

@Component({
    selector: 'app-load',
    templateUrl: './load.component.html',
    styleUrls: ['./load.component.scss'],
    encapsulation: ViewEncapsulation.None
})
export class LoadComponent implements OnInit, OnDestroy {
    @HostBinding('class.load') hostClass = true;

    selectedMode: ListItem;
    selectedNetwork: ListItem;
    loading: boolean;
    hasWallet = false;
    modes: ListItem[] = [];
    networks: ListItem[] = [];
    remember: boolean;
    connection: signalR.HubConnection;
    delayed = false;
    freeSpace: any;
    resetDone = false;
    noSpace = false;
    apiSubscription: any;
    routingSubscription: any;
    downloadUrl: string;
    // dataFolder: string;
    // nodePath: string;
    downloading = false;
    downloadProgress: { url: string, target: string, size: number, progress: number, downloaded: number, status: string };
    unpacking = false;
    unpacked = false;
    featureStatus: any[];
    progressbarValue = 0;
    curSec = 0;
    moduleState = null;

    private subscription: Subscription;
    private statusIntervalSubscription: Subscription;
    private readonly TryDelayMilliseconds = 3000;
    private readonly MaxRetryCount = 50;
    loadingFailed = false;
    public apiConnected = false;
    private ipc: Electron.IpcRenderer;

    constructor(
        private route: ActivatedRoute,
        private http: HttpClient,
        private authService: AuthenticationService,
        private electronService: ElectronService,
        private router: Router,
        public chains: ChainService,
        private log: Logger,
        private zone: NgZone,
        private readonly cd: ChangeDetectorRef,
        private apiService: ApiService,
        private storage: StorageService,
        public appState: ApplicationStateService) {

        this.modes = [
            { id: 'full', name: 'Full' },
        ];

        if (!environment.production) {
            this.modes.push(
                // { id: 'demo', name: 'Demo' }, // Auto-wallet creation, etc.
                { id: 'local', name: 'Custom' }, // Launches the daemon by specifying path to .dll file.
                { id: 'manual', name: 'Manual' }, // Manual startup of daemon, does not send shutdown messages. Useful when you debug node with Visual Studio.
                { id: 'simple', name: 'Mobile' }); // API Wallet mode.
            // { id: 'light', name: 'Light' }, // Full Node in Purge mode and other features disabled.
            // { id: 'pos', name: 'Point-of-Sale (POS)' },
            // { id: 'readonly', name: 'Read-only' });
        }

        this.networks = [
            // { id: 'main', name: 'Main' },
            { id: 'exosmain', name: 'EXOS Main' },
            // { id: 'citytest', name: 'City Chain (Test)' },
            // { id: 'stratistest', name: 'Stratis (Test)' },
            // { id: 'stratismain', name: 'Stratis' },
            // { id: 'regtest', name: 'RegTest' }
        ];


        this.selectedMode = this.modes.find(mode => mode.id === this.appState.mode);
        this.selectedNetwork = this.networks.find(network => network.id === this.appState.network);
        this.remember = false;

        this.log.info('Mode:', this.selectedMode);
        this.log.info('Network:', this.selectedNetwork);
        this.log.info('Daemon App State:', JSON.stringify(this.appState.daemon));



        this.ipc = electronService.ipcRenderer;

        this.ipc.on('choose-data-folder', (event, path: string) => {
            // notificationService.show({ title: 'Checking for update...', body: JSON.stringify(info) });
            console.log('choose-data-folder: ', path);
            this.appState.daemon.datafolder = path;

            // We must force a detection here to make it update immediately.
            this.cd.detectChanges();
        });

        this.ipc.on('choose-node-path', (event, path: string) => {
            // notificationService.show({ title: 'Checking for update...', body: JSON.stringify(info) });
            console.log('choose-node-path: ', path);
            // this.nodePath = path;
            this.appState.daemon.path = path;

            // We must force a detection here to make it update immediately.
            this.cd.detectChanges();
        });

        this.ipc.on('download-blockchain-package-finished', (event, finished, progress, error) => {
            if (error) {
                console.error('Error during downloading: ' + error);
            }

            this.downloadProgress = progress;

            if (finished) {
                // If finished with error, we won't unpack.
                if (progress.status === 'Done') {
                    this.downloading = false;
                    this.unpack(progress.target);
                }
                else {
                    this.downloading = false;
                }

                // Clear the download progress.
                this.downloadProgress = null;
            }

            // We must force a detection here to make it update immediately.
            this.cd.detectChanges();
        });

        this.ipc.on('unpack-blockchain-package-finished', (error) => {

            this.unpacking = false;
            this.unpacked = true;

            if (error) {
                console.error('Error during downloading: ' + error.target);
            }
            else {

            }

            // We must force a detection here to make it update immediately.
            this.cd.detectChanges();
        });


    }

    resetDatabase() {
        this.unpacked = false;
        this.resetDone = false;
        this.noSpace = false;
        // Send array of path information to be used in path.join to get native full path in the main process.
        this.log.info('Reset Blockchain Database...');

        const path = this.electronService.ipcRenderer.sendSync('reset-database');
        this.log.info('Reset completed');
        this.resetDone = true;
    }

    checkStorage() {
        this.unpacked = false;
        this.resetDone = false;
        this.noSpace = false;
        const free = this.electronService.ipcRenderer.sendSync('check-storage');
        this.freeSpace = free;
    }

    initialize() {
        this.apiService.initialize();

        const network = coininfo('exos').toBitcoinJS();
        this.appState.networkDefinition = network;

        this.appState.networkParams = {
            private: network.wif,
            public: network.pubKeyHash
        };

        // this.appState.networkParams = {
        //     private: network.wif,
        //     public: network.pubKeyHash
        // };

        console.log('INITILIZE!....', this.appState.daemon);
        console.log(this.appState);

        // Update the overlay icon to visualize current chain.

        if (this.appState.daemon.mode === 'full' || this.appState.daemon.mode === 'local' || this.appState.daemon.mode === 'light') {
            this.loading = true;
            this.appState.connected = false;
            this.cd.detectChanges();
            this.fullNodeConnect();
        } else if (this.appState.daemon.mode === 'manual') {
            this.loading = false;
            this.appState.connected = true;
            this.cd.detectChanges();
            this.fullNodeConnect();
        } else if (this.appState.daemon.mode === 'simple') {
            // TODO: Should send the correct network, hard-coded to city main for now.
            // const network = coininfo('city').toBitcoinJS();
            // this.appState.networkDefinition = network;

            // this.appState.networkParams = {
            //     private: network.wif,
            //     public: network.pubKeyHash
            // };

            this.loading = false;
            this.appState.connected = true;
            this.router.navigateByUrl('/login');
        }
    }

    onDaemonFolderChange(event) {
        this.log.info('Daemon folder changed:', event);

        if (event.target.files.length > 0) {
            this.appState.daemon.path = event.target.files[0].path;
        } else {
            this.appState.daemon.path = '';
        }
    }

    onDataFolderChange(event) {
        this.log.info('Data folder changed:', event);

        if (event.target.files.length > 0) {
            this.appState.daemon.datafolder = event.target.files[0].path;
        } else {
            this.appState.daemon.datafolder = '';
        }
    }

    launch() {
        this.appState.updateNetworkSelection(this.remember, this.selectedMode.id, this.selectedNetwork.id, this.appState.daemon.path, this.appState.daemon.datafolder);

        // If the selected mode is not 'local', we'll reset the path and data folder.
        if (this.appState.mode !== 'local') {
            localStorage.removeItem('Network:Path');
            localStorage.removeItem('Network:DataFolder');
        }

        this.initialize();
    }

    fullNodeConnect() {
        // Do we need to keep a pointer to this timeout and remove it, or does the zone handle that?
        this.zone.run(() => {
            setTimeout(() => {
                this.delayed = true;
            }, 1200000); // 60000 Make sure it is fairly high, we don't want users to immediatly perform advanced reset options when they don't need to.
        });
        this.startTimer(100);
        this.tryStart();
    }

    downloadAndUnpack() {
        this.checkStorage();
        this.unpacked = false;
        this.resetDone = false;
        this.noSpace = false;

        if (this.freeSpace > 5368709120) {
            // If user does "Copy as path" we must ensure we replace the quotes.
            const url = 'https://s3.amazonaws.com/exos.blockchain/EXOS-main.zip';
            const isAbsolute = new RegExp('^([a-z]+://|//)', 'i');

            if (isAbsolute.test(url)) {
                console.log('Download: ' + url);
                this.downloading = true;

                // Send array of path information to be used in path.join to get native full path in the main process.

                const downloadInfo = {
                    url
                };

                this.log.info('Target Folder...', downloadInfo);
                this.electronService.ipcRenderer.sendSync('download-blockchain-package', downloadInfo);
            }
            else {
                // If the user supplies an relative / local path, we'll go ahead and unpack directly.
                this.unpack(url);
            }
        }
        else {
            this.noSpace = true;
        }
    }

    openFolder(directory: string): void {
        this.electronService.shell.openPath(directory);
    }

    unpack(source: string) {
        // Send array of path information to be used in path.join to get native full path in the main process.
        const pathInfo = [this.appState.daemon.datafolder, 'exos', 'EXOSMain'];

        const downloadInfo = {
            source,
            path: pathInfo
        };

        this.unpacking = true;

        // unpack-blockchain-package
        this.electronService.ipcRenderer.sendSync('unpack-blockchain-package', downloadInfo);
    }

    cancelDownload() {
        this.electronService.ipcRenderer.sendSync('download-blockchain-package-abort');
        this.downloading = false;
    }

    humanFileSize(bytes, si = false, dp = 1) {
        const thresh = si ? 1000 : 1024;
        if (Math.abs(bytes) < thresh) {
            return bytes + ' B';
        }

        const units = si
        ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
        : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
        let u = -1;
        const r = 10 ** dp;

        do {
            bytes /= thresh;
            ++u;
        } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);


        return bytes.toFixed(dp) + ' ' + units[u];
    }

    // Attempts to initialise the wallet by contacting the daemon.  Will try to do this MaxRetryCount times.
    private tryStart() {
        let retry = 0;
        const stream$ = this.apiService.getNodeStatus().pipe(
            retryWhen(errors =>
                errors.pipe(delay(this.TryDelayMilliseconds)).pipe(
                    tap(errorStatus => {
                        if (retry++ === this.MaxRetryCount) {
                            throw errorStatus;
                        }
                        this.log.info(`Retrying ${retry}...`);
                    })
                )
            )
        );

        this.subscription = stream$.subscribe(
            (data: NodeStatus) => {
                this.apiConnected = true;
                this.statusIntervalSubscription = this.apiService.getNodeStatusCustomInterval(350) // Get status quickly during initial load.
                    .subscribe(
                        response => {
                            this.featureStatus = response.featuresData.map(d => {
                                return {
                                    name: d.namespace.split('.').pop(),
                                    state: d.state,
                                    initialized: d.state === 'Initialized'
                                };
                            });

                            const loadingStatus = this.featureStatus.filter(x => x.name === 'WalletFeature');

                            if (loadingStatus.length > 0 && loadingStatus[0].initialized) {
                                this.statusIntervalSubscription.unsubscribe();
                                this.start();
                            }
                        }
                    );
            }, (error: any) => {
                this.log.info('Failed to start wallet');
                this.loading = false;
                this.loadingFailed = true;
            }
        );
    }

    private startTimer(seconds: number) {
        const time = seconds;
        const timer$ = interval(1000);

        const sub = timer$.subscribe((sec) => {
            this.progressbarValue = 0 + sec * 90 / seconds;
            this.curSec = sec;

            if (this.curSec === seconds) {
                if (this.moduleState === 'Initialized') {
                    this.progressbarValue = 100;
                }
                sub.unsubscribe();
            }

        });
    }

    start() {
        // this.simpleWalletConnect();

        // We have successful connection with daemon, make sure we inform the main process of |.
        this.electronService.ipcRenderer.send('daemon-started');

        this.loading = false;
        this.appState.connected = true;
        this.progressbarValue = 100;
        this.router.navigateByUrl('/login');
    }

    ngOnInit() {
        this.routingSubscription = this.route
            .queryParams
            .subscribe(params => {
                if (params.loading) {
                    this.loading = true;
                    this.loadingFailed = false;
                    this.appState.connected = false;
                } else {
                    this.loading = false;
                }

                if (params.changing) {
                    // this.initialize();
                }
            });

        // this.unsubscribe(); // Make sure we unsubscribe existing listeners.

        // this.launch();
        // this.initialize();
        // }
        // else {
        //     const existingMode = localStorage.getItem('Network:Mode');

        //     // If user has choosen to remember mode, we'll redirect directly to login, when connected.
        //     if (existingMode != null) {
        //         this.initialize();
        //     }
        // }



        const existingMode = localStorage.getItem('Network:Mode');

        // If user has choosen to remember mode, we'll redirect directly to login, when connected.
        if (existingMode != null) {
            this.initialize();
        }

    }

    ngOnDestroy() {
        this.unsubscribe();
    }

    unsubscribe() {
        if (this.routingSubscription) {
            this.routingSubscription.unsubscribe();
        }

        if (this.apiSubscription) {
            this.apiSubscription.unsubscribe();
        }
    }

    cancel() {
        this.unsubscribe();

        this.appState.connected = false;
        this.loading = false;
        this.delayed = false;
        this.appState.daemon.mode = null;
    }

    simpleWalletConnect() {
        this.connection = new signalR.HubConnectionBuilder()
            .withUrl('http://localhost:4337/node')
            .build();

        this.connection.on('BlockConnected', (block) => {
            console.log('BlockConnected:' + block);
        });

        this.connection.on('TransactionReceived', (trx) => {
            console.log('TransactionReceived:' + trx);
        });

        this.connection.on('txs', (transactions) => {
            console.log(transactions);
            // TODO: Update a bitcore-lib fork to add support for Stratis/City Chain.
            // var tx1 = transactions[0];
            // var tx = bitcoin.Transaction.fromHex(tx1.value.hex);
        });

        const self = this;
        // Transport fallback functionality is now built into start.
        this.connection.start()
            .then(() => {
                console.log('connection started');
                self.connection.send('Subscribe', { events: ['TransactionReceived', 'BlockConnected'] });
            })
            .catch(error => {
                console.error(error.message);
            });
    }
}
