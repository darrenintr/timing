"""Write ad hoc export options for the two independently provisioned iOS targets."""
import os
import plistlib
from pathlib import Path

options = {
    'method': 'ad-hoc',
    'signingStyle': 'manual',
    'teamID': os.environ['IOS_TEAM_ID'],
    'provisioningProfiles': {
        'io.github.darrenintr.timing': os.environ['IOS_APP_PROFILE_NAME'],
        'io.github.darrenintr.timing.widget': os.environ['IOS_WIDGET_PROFILE_NAME'],
    },
}
with (Path(os.environ['RUNNER_TEMP']) / 'timing-export-options.plist').open('wb') as file:
    plistlib.dump(options, file)
