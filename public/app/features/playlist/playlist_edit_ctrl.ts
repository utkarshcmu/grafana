import _ from 'lodash';
import coreModule from '../../core/core_module';

export class PlaylistEditCtrl {
  filteredDashboards: any = [];
  filteredTags: any = [];
  filteredVars: any = [];
  selectedDashForVarPlaylist: any = null;
  searchQuery = '';
  loading = false;
  playlist: any = {
    interval: '5m',
  };

  playlistItems: any = [];
  dashboardresult: any = [];
  tagresult: any = [];
  varResult: any = [];
  navModel: any;
  isNew: boolean;
  playlistTypes = [{ name: 'Dashboard Based', value: 'dash' }, { name: 'Variable Based', value: 'vari' }];

  /** @ngInject */
  constructor(private $scope, private backendSrv, private $location, $route, navModelSrv) {
    this.navModel = navModelSrv.getNav('dashboards', 'playlists', 0);
    this.isNew = !$route.current.params.id;

    if ($route.current.params.id) {
      const playlistId = $route.current.params.id;

      backendSrv.get('/api/playlists/' + playlistId).then(result => {
        this.playlist = result;
      });

      backendSrv.get('/api/playlists/' + playlistId + '/items').then(result => {
        this.playlistItems = result;
        if (this.playlist.type === 'vari' && this.playlistItems.length > 0) {
          this.backendSrv.get('/api/dashboards/uid/' + this.playlistItems[0].value).then(result => {
            this.selectDashForVarPlaylist(result.dashboard);
          });
        }
      });
    }
  }

  filterFoundPlaylistItems() {
    this.filteredDashboards = _.reject(this.dashboardresult, playlistItem => {
      return _.find(this.playlistItems, listPlaylistItem => {
        return parseInt(listPlaylistItem.value, 10) === playlistItem.id;
      });
    });

    this.filteredTags = _.reject(this.tagresult, tag => {
      return _.find(this.playlistItems, listPlaylistItem => {
        return listPlaylistItem.value === tag.term;
      });
    });

    this.filteredVars = _.reject(this.varResult, vari => {
      return _.find(this.playlistItems, listPlaylistItem => {
        return listPlaylistItem.title === vari.name;
      });
    });
  }

  addPlaylistItem(playlistItem) {
    playlistItem.value = playlistItem.id.toString();
    playlistItem.type = 'dashboard_by_id';
    playlistItem.order = this.playlistItems.length + 1;

    this.playlistItems.push(playlistItem);
    this.filterFoundPlaylistItems();
  }

  addTagPlaylistItem(tag) {
    const playlistItem: any = {
      value: tag.term,
      type: 'dashboard_by_tag',
      order: this.playlistItems.length + 1,
      title: tag.term,
    };

    this.playlistItems.push(playlistItem);
    this.filterFoundPlaylistItems();
  }

  removePlaylistItem(playlistItem) {
    _.remove(this.playlistItems, listedPlaylistItem => {
      return playlistItem === listedPlaylistItem;
    });
    this.filterFoundPlaylistItems();
  }

  savePlaylist(playlist, playlistItems) {
    let savePromise;

    playlist.items = playlistItems;

    savePromise = playlist.id
      ? this.backendSrv.put('/api/playlists/' + playlist.id, playlist)
      : this.backendSrv.post('/api/playlists', playlist);

    savePromise.then(
      () => {
        this.$scope.appEvent('alert-success', ['Playlist saved', '']);
        this.$location.path('/playlists');
      },
      () => {
        this.$scope.appEvent('alert-error', ['Unable to save playlist', '']);
      }
    );
  }

  isPlaylistEmpty() {
    return !this.playlistItems.length;
  }

  backToList() {
    this.$location.path('/playlists');
  }

  searchStarted(promise) {
    promise.then(data => {
      this.dashboardresult = data.dashboardResult;
      this.tagresult = data.tagResult;
      this.filterFoundPlaylistItems();
    });
  }

  movePlaylistItem(playlistItem, offset) {
    const currentPosition = this.playlistItems.indexOf(playlistItem);
    const newPosition = currentPosition + offset;

    if (newPosition >= 0 && newPosition < this.playlistItems.length) {
      this.playlistItems.splice(currentPosition, 1);
      this.playlistItems.splice(newPosition, 0, playlistItem);
    }
  }

  movePlaylistItemUp(playlistItem) {
    this.movePlaylistItem(playlistItem, -1);
  }

  movePlaylistItemDown(playlistItem) {
    this.movePlaylistItem(playlistItem, 1);
  }

  selectDashForVarPlaylist(dashboard) {
    this.selectedDashForVarPlaylist = dashboard;
    this.backendSrv.get('/api/dashboards/uid/' + dashboard.uid).then(result => {
      this.varResult = result.dashboard.templating.list;
      this.filterFoundPlaylistItems();
    });
  }

  removeDashForVarPlaylist() {
    this.selectedDashForVarPlaylist = null;
    this.playlistItems.length = 0;
  }

  addVarAsPlaylistItem(playlistItem) {
    playlistItem.value = this.selectedDashForVarPlaylist.uid;
    playlistItem.type = 'var_by_dashboard';
    playlistItem.order = this.playlistItems.length + 1;
    playlistItem.title = playlistItem.name;
    this.playlistItems.push(playlistItem);
    this.filterFoundPlaylistItems();
  }
}

coreModule.controller('PlaylistEditCtrl', PlaylistEditCtrl);
