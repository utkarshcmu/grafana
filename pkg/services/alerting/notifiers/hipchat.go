package notifiers

import (
	"encoding/json"
	"fmt"

	"github.com/grafana/grafana/pkg/bus"
	"github.com/grafana/grafana/pkg/log"
	m "github.com/grafana/grafana/pkg/models"
	"github.com/grafana/grafana/pkg/services/alerting"
)

func init() {
	alerting.RegisterNotifier("hipchat", NewHipchatNotifier)
}

func NewHipchatNotifier(model *m.AlertNotification) (alerting.Notifier, error) {
	room := model.Settings.Get("room").MustString()
	if room == "" {
		return nil, alerting.ValidationError{Reason: "Could not find room property in settings"}
	}

	token := model.Settings.Get("token").MustString()
	if token == "" {
		return nil, alerting.ValidationError{Reason: "Could not find token property in settings"}
	}

	return &HipchatNotifier{
		NotifierBase: NewNotifierBase(model.Id, model.IsDefault, model.Name, model.Type, model.Settings),
		Room:         room,
		Token:        token,
		log:          log.New("alerting.notifier.hipchat"),
	}, nil
}

type HipchatNotifier struct {
	NotifierBase
	Room  string
	Token string
	log   log.Logger
}

func (this *HipchatNotifier) Notify(evalContext *alerting.EvalContext) error {
	this.log.Info("Executing hipchat notification", "ruleId", evalContext.Rule.Id, "notification", this.Name)
	//	metrics.M_Alerting_Notification_Sent_Hipchat.Inc(1)

	ruleUrl, err := evalContext.GetRuleUrl()
	if err != nil {
		this.log.Error("Failed get rule link", "error", err)
		return err
	}

	type R map[string]interface{}

	sm := evalContext.GetStateModel()

	// This is the activity title and also the fallback if the
	// hipchat client does not support cards
	basicHtmlDesc := fmt.Sprintf("'%s' is now <b>%v</b>",
		evalContext.Rule.Name, sm.Text)

	if evalContext.ImagePublicUrl != "" {
		basicHtmlDesc = basicHtmlDesc +
			fmt.Sprintf(` - <i><a href="%s"/>[ view graph image ]</a></i>`, evalContext.ImagePublicUrl)
	}

	// 'Application' style card
	// Option to use more compact 'activity' one with the 'activity' key
	// Ref: https://developer.atlassian.com/hipchat/guide/sending-messages
	card := R{
		// id is used by hipchat to de-duplicate ... i think
		"id": fmt.Sprintf("%s-%v",
			evalContext.GetNotificationTitle(), evalContext.StartTime.Unix()),
		"style":  "application",
		"url":    ruleUrl,
		"format": "medium",
		"title":  evalContext.GetNotificationTitle(),
		"description": R{
			"format": "html",
			"value":  basicHtmlDesc,
		},
		"icon": R{
			"url": "http://grafana.org/assets/img/fav32.png",
		},
		/*		"activity": R{
					"html": basicHtmlDesc,
				},
		*/
	}

	if evalContext.ImagePublicUrl != "" {
		card["icon"] = R{
			"url": evalContext.ImagePublicUrl,
		}
	}

	// Attributes is every 'line' item, which in Grafana,
	// will correlate to every metric/condition and
	// other metadata
	attributes := []R{}

	for _, event := range evalContext.EvalMatches {
		attributes = append(attributes, R{
			"label": event.Metric,
			"value": R{
				"label": fmt.Sprintf("%v", event.Value),
			},
		})
	}

	if evalContext.Error != nil {
		attributes = append(attributes, R{
			"label": "Error",
			"value": R{
				"label": evalContext.Error.Error(),
			},
		})
	}

	card["attributes"] = attributes

	body := R{
		"message":        basicHtmlDesc,
		"message_format": "html",
		"card":           card,
	}

	// For HipChat: 'Valid values: yellow, green, red, purple, gray, random.'
	// so we cannot use the hex colors in the state model
	// Default is 'yellow'
	switch evalContext.Rule.State {
	case m.AlertStateOK:
		body["color"] = "green"
	case m.AlertStateAlerting:
		body["color"] = "red"
	}

	data, err := json.Marshal(&body)
	if err != nil {
		this.log.Error("Failed to marshal json", "error", err)
		return err
	}

	// Hipchat will bounce with HTTP 400 if content-type is not present
	cmd := &m.SendWebhookSync{
		Url:         fmt.Sprintf("https://api.hipchat.com/v2/room/%s/notification?auth_token=%s", this.Room, this.Token),
		Body:        string(data),
		ContentType: "application/json",
	}

	if err := bus.DispatchCtx(evalContext.Ctx, cmd); err != nil {
		this.log.Error("Failed to send hipchat notification", "error", err, "webhook", this.Name)
	}

	return nil
}
