import os
from pathlib import Path

# Ensure the controller is configured for AskUI before VisionAgent() is created.
controller_path = r"C:\Users\LarryGOYEAU\AppData\Roaming\askui GmbH\AskUI Suite\.askui-suite\DependencyCache\AskUIRemoteDeviceController-0.22.0.1\AskuiRemoteDeviceController.exe"
os.environ.setdefault("ASKUI_CONTROLLER_PATH", str(Path(controller_path)))

from askui import VisionAgent
from askui import ResponseSchemaBase

class SearchResults(ResponseSchemaBase):
    results: list[str]

l = ['SPDR MSCI All Country World UCITS ETF (Acc)',
    'Scalable MSCI AC World Xtrackers UCITS ETF 1C',
    'iShares MSCI ACWI UCITS ETF USD (Acc)']

with VisionAgent() as agent:
    previous_item = l[0]
    for i, item in enumerate(l):
        agent.act(f"Empty the search field containing {previous_item}.")
        previous_item = item
        agent.type(item)
        results = agent.get(
            "Get the results of the search.",
            response_schema=SearchResults
        )
        print("\n--------------------------------")
        print("RESULTS:\n")
        print(results)
        print("--------------------------------\n\n")
        if i%10 == 0:
            captcha = agent.get(
                "Is there a captcha?",
                response_schema=bool
            )
            if captcha:
                print("CAPTCHA DETECTED")
                break
                
    agent.act(f"Empty the search field containing {previous_item}.")